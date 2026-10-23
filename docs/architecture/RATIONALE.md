# OpenGame Linux on TanStack Start + Effect 4 + PostgreSQL 18: design rationale

Sketch: `sketch/` (typechecks with `tsc` 7.0.2 strict + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`, and `vite build`s, against the spike's installed packages; see Evidence). Module map: `MODULES.md`. Build plan: `PLAN.md`.

## Problem

Same product, same section 8, same round 1 domain decisions; the stack changed to React 19 + Effect 4 + PostgreSQL 18 on TanStack Start. Section 8 is the spec: 17 tables, a review block on three of them, and about 25 rules. The domain shape is settled. The stack decides five things the spike made non-obvious:

- **Start loses thrown errors.** A thrown `Schema.TaggedError` reaches the browser as `new Error("")`, and in-process SSR hides this (spike Q3, gotchas 4 and 9).
- **Server-fn files leak their module scope into the client bundle.** That put `pg` in the browser and broke hydration (gotcha 3).
- **better-auth owns its tables and its own `pg` Pool.** It maps `app_user.alias` and `app_user.email` fine, keeps the password hash in `account.password`, and uses text ids (Q7).
- **The driver has traps.** `int8` decodes as `bigint`, which `JSON.stringify` rejects. PG error fields are untyped. A `sql.unsafe` call takes one statement only (Q5, Q6, gotchas 5, 7, 8).
- **The deadline is 2026-10-20**, with 3 students plus agents and 8 working days.

## Usage (caller's view)

**The ficha loads.** One route file, one server fn, one Effect program. The page type is inferred end to end, and nobody writes a props interface.

```tsx
// src/routes/juegos/$gameId.tsx
export const Route = createFileRoute('/juegos/$gameId')({
  loader: ({ params }) => gamePageFn({ data: { gameId: params.gameId } }),
  component: Ficha,
})
function Ficha() {
  const { game, summary, personal, profiles, pending } = Route.useLoaderData()     // fully typed
  return (<>
    <GameStatus summary={summary} pending={pending} />                                {/* variant 1 badge */}
    {personal?.on_my_distribution && <p>En tu distribución: {compatibilityStatus[personal.on_my_distribution.summary.status].text}</p>}
    <EnvironmentMatrix setups={summary.setups} myDistribution={…} />                  {/* matrix */}
  </>)
}

// src/fns/catalog.ts: the whole server boundary for this page
export const gamePageFn = createServerFn({ method: 'GET' })
  .validator(Schema.toStandardSchemaV1(Schema.Struct({ gameId: GameId })))
  .handler(({ data }) => runRead(gamePage(data.gameId)))

// src/server/queries/game.ts: rows decoded by the domain Schema, summary by the pure rule
const tests = yield* approvedTests(gameId)             // ApprovedTest has review_status: Literal('aprobado')
const summary = summarize(tests, now)
return { game, editions, summary, protondb, demo, pending, profiles, causes, diagnostic, personal }
```

A missing game makes the program fail with `NotFound`. `runRead` turns that into `throw notFound()`, and the root `notFoundComponent` renders it, on SSR and on client navigation alike.

**A report breaks a rule, and the field shows the error.**

```tsx
// src/routes/juegos/$gameId_.reportar.tsx
const r = useAction(NewReport, submitReportFn, {
  onFailure: ruleErrors,                   // error: { _tag: 'ReglaIncumplida'; rule: Rule }, the only failure submitReport returns
  onComplete: () => navigate({ to: '/juegos/$gameId', params: { gameId } }),
})
<form {...r.form}>
  <select name="profile_id">…</select>
  <FieldError errors={r.errors} field="profile_id" />   {/* "El perfil es para otra distribución que la de tu diagnóstico." */}
  <button disabled={r.submitting}>Enviar reporte</button>
</form>
```

`useAction` checks the input in two places. First, the browser decodes the FormData with `NewReport`, so a blank observation or a failing result without a failure shows its field error before any request. If that passes, the server fn validates the same Encoded value with the same schema. The program then fails with `RuleViolated({ rule: 'perfil_otra_distribucion' })` from `mismatches`, and `runAction` returns `{ ok: false, error: { _tag: 'ReglaIncumplida', rule: 'perfil_otra_distribucion' } }`. The `rules` table (`domain/errors.ts`) maps each rule to `{ field, message }`.

**A reviewer approves.**

```tsx
// src/routes/revision.tsx: blockers come from the same function decide runs
const r = useAction(Schema.Struct({ ref: ContributionRef, decision: Decision }), decideFn, {
  onFailure: (f) => {                                  // exhaustive: delete a case and tsc fails (verified)
    switch (f._tag) {
      case 'ReglaIncumplida':     return { decision: rules[f.rule].message }
      case 'AprobacionBloqueada': return { decision: f.blockers.map((b) => blocker[b]).join(' ') }
    }
  },
  onComplete: () => router.invalidate(),
})
// <button name="decision[_tag]" value="Aprobar"> with decision[reason], decision[evidence]
// Decision's 'Aprobar' member requires a non-blank evidence: "approve without evidence" has no encoding.

// src/fns/review.ts
export const decideFn = createServerFn({ method: 'POST' })
  .validator(Schema.toStandardSchemaV1(Schema.Struct({ ref: ContributionRef, decision: Decision })))
  .handler(({ data }) => runAction(Schema.Union([RuleViolated, InvalidTransition, ApprovalBlocked]), decide(data.ref, data.decision)))
```

`decide` requires a `Reviewer`, a branded `SignedInUser` that only `requireReviewer` can mint. It locks the row, rejects self-review, and runs `planTransition(current, decision)`. The result `sin_cambios` makes a double click a no-op. It checks `approvalBlockers` and writes the five columns. All of this happens inside the one transaction `runAction` opens.

**The pure core, as its tests call it.**

```ts
statusOf(['funciona', 'no_inicia'])                    // 'resultados_variables'
statusOf([])                                           // 'sin_evidencia'
evaluate(machineOnLinux(diag), requirements(profile))  // { verdict: 'informacion_insuficiente', checks, advisory_only }
evaluate(projected('1.0', '1.1'), minimum('1.1'))      // a straddling range: checks [{ status: 'desconocido', detected: { value: '1.0–1.1', origin: 'proyectado' } }]
planTransition('aprobado', { _tag: 'Aprobar', ... })   // 'sin_cambios'
mismatches(test, profile)                              // [{ aspect: 'distribucion', ... }]
```

## Shape

**Four directories and one dependency direction.** The direction runs `routes`/`ui` → `fns` → `server` → `domain`, and `routes`/`ui` → `domain` directly. `src/boundaries.test.ts` enforces it (MODULES.md).

- `domain/` is pure and isomorphic, importing only `effect`. It holds Schemas and pure functions: the result-set rule, the summary, the evaluation, the state machine, comparability, input schemas and failure classes. The browser imports it too.
- `server/` holds the Effect programs: read models (`queries/`), the two single writers (`commands/contributions.ts`, `commands/review.ts`), auth, the migrations, the one payload parser, and `run.ts`.
- `fns/` is the network boundary. It holds only `createServerFn` exports, each one a validator plus a handler that calls `runRead(...)` or `runAction(...)`. This layer is forced by gotcha 3, and the test keeps it that way: a top-level line that is not an import or a `createServerFn` export fails the build with the fix in the message.
- `routes/` and `ui/` are plain React. No Effect runtime runs in the browser. Only `Schema` ships there, for forms and search params, at about 29 kB gzip as measured.

A request crosses three files: route → `fns/x.ts` → `server/.../program.ts`, plus pure `domain` calls. `run.ts` is infrastructure every handler shares, not a per-request layer.

**Start-native boundary, with two runners.** `server/run.ts` exports exactly two functions. Both resolve the better-auth session once into the per-request `Visitor` service (`Option<User>`, where a deactivated account becomes `None`).

- `runRead(program): Promise<A>` is for loaders. Its type allows only `NotFound | Unauthenticated | Forbidden | SqlError | SchemaError`. The first three become the router's own `notFound()` / `redirect()`, which Start already carries over SSR and RPC. Infra errors are thrown as defects and the route's `errorComponent` renders them.
- `runAction(errors: S, program): Promise<Reply<A, S['Encoded']>>` is for everything a UI event triggers: every write, plus the guest's hardware evaluation. It runs the program in **one transaction**. A program whose error channel holds a domain failure missing from `errors` does not compile (verified by deleting `ApprovalBlocked` from `decideFn`).

**Domain-error transport: returned typed union, not a serialization adapter.** The evidence:

1. With an adapter, a server fn still returns `Promise<A>` and the rejection is `unknown`. The compiler cannot make the report form handle `RuleViolated`. With `Reply`, `r.value` cannot be read without narrowing `r.ok`, and `onFailure`'s switch is exhaustive over the exact tags the program can produce. I verified both failure directions with `tsc`.
2. An adapter is a global registry: one `createSerializationAdapter` per class, about 7 lines each, a dev-server restart on change (gotcha 9), and `instanceof` across bundles. A union member is just `Schema.encodeSync(errors)(e)`, a plain `{ _tag, ... }` that seroval carries (Q3 variant B, observed).
3. In-process SSR hides a missing adapter (gotcha 4), so that bug only shows in the browser. A returned value behaves the same on every path.
4. Control flow (not found, login, forbidden) uses the router's native throwables, and those already work.

Structural input errors never travel at all. The browser decodes the form with the same schema the validator uses, so the validator's JSON-in-`Error.message` failure (gotcha 6) only reaches a tampered client.

**One Schema source of truth, end to end.** Each `domain` Schema plays every role:

- The DB `CHECK (col IN …)` lists come from `Literals.literals` in `migrations.ts`.
- Row decoding uses `SqlSchema.findAll({ Result })`.
- The browser form decode uses `Schema.fromFormData(Schema.toCodecStringTree(S))`.
- The server fn validator uses `Schema.toStandardSchemaV1(S)`.
- The route search params use `validateSearch: toStandardSchemaV1(CatalogFilter)`.
- Page data is not a Schema. It is the program's inferred success type, which flows through `createServerFn` into `useLoaderData()`.

The only lists the compiler cannot derive are the `Record<Union, …>` tables (`rules`, `vocabulary`, `requiresFailure`, `tables`), and `satisfies Record<…>` fails the build on any gap. Constraint names mapped back to rules (`constraints.ts`) get a DB test that asserts each name exists.

**Data decisions the stack forced:**

- **Ids are `integer GENERATED ALWAYS AS IDENTITY`**, branded `Schema.Int`. They decode as numbers, so URLs, React keys and JSON never meet `bigint`. The doc says "Entero", and 2^31 rows is plenty.
- **`numeric(7,2)` FPS decodes through `FiniteFromString`**, and U0 confirms the driver type.
- **Column names stay snake_case from the DB through TS to JSX** (`review_status`, `last_tested`). No rename layer exists to drift. Migration 7 moved them from Spanish to English in one step.

**Rules have one home each.** The index sits in the header of `server/schema/migrations.ts`. Row-local rules are DB CHECKs, keys and three triggers. Every trigger now raises `USING ERRCODE='check_violation', CONSTRAINT='og_*'`, so `withDbRules` can map it (Q5). Cross-row rules live in the two single writers. Comparability is one pure function, `mismatches`, called at save, at approval, and by the report form's loader to offer only comparable profiles. The failing-result rule is a filter on `NewReport`, so the browser shows it before any request.

**Auth: the doc's `usuario` table, named `app_user` since migration 7.** Round 1 kept Laravel's `users` because renaming meant forking the starter kit. That reason is gone. better-auth's `modelName: 'app_user'` plus `fields` maps the table's column names (alias and email, then `correo`, were observed in the spike; the timestamp fields are a U0 probe), and `rol`/`activo` are `additionalFields` with `input: false`, so sign-up cannot set them. Two recorded deviations go in a `COMMENT ON`: `id` is text, and `contrasena_hash` lives in `account.password`. Roles are enforced by type. `requireUser` yields a `User`. `requireReviewer` yields a `Reviewer` brand, and `decide` cannot run without one. Roles change only through `changeAccess`, from `pnpm set-role` or `/admin/usuarios`, which needs the `Admin` brand from `requireAdmin`. Route `beforeLoad` guards are UX only.

**Migrations and seeds.** The Effect `PgMigrator` owns every table. `1_auth` is better-auth's own `compileMigrations()` output, pasted verbatim. A DB test asserts that `getMigrations(auth.options)` then has nothing left to create, so the config and the SQL cannot drift. The seed writes approvals only through `decide` (the boundaries test forbids any other write of `review_status`), so it replays the 8.10 walkthrough and proves the rules admit the demo.

**Detector handoff.** `GET /opengame-detect.sh` is a Start server route. It serves the script (Vite `?raw`) with `__OPENGAME_URL__` replaced by the request origin, so `--open` lands on whichever host served it: dev, preview, or the defense laptop. `/diagnostico/importar` is `ssr: false`. It reads `#d=`, strips it with `replaceState`, keeps the raw string in `sessionStorage`, and posts it untouched to `evaluateDiagnosticFn` through `runAction(InvalidPayload, …)`. Guests get the evaluation and nothing is stored. "Guardar en mi equipo" requires login and is idempotent on `UNIQUE (machine_id, captured_at)`. The parser lives under `server/`, so the browser cannot import it.

**Where Effect pays, and where it doesn't.** It pays on the server:

- typed error channels that decide what reaches the UI
- `Visitor` as a per-request service
- one `ManagedRuntime` holding the pool, plus HMR dispose
- `withTransaction` per action
- Schema at every boundary
- `@effect/vitest` for programs against a real DB

It is ceremony elsewhere, so it is absent there: React components and hooks, better-auth (left as is), the detector, pure functions (plain TS, no `Effect` return types). The only Effect type that crosses into the browser is `Schema`.

**What it deliberately does not do.** It never stores a verdict, a projection or an FPS estimate. It stores a Steam library only when the user chooses to. It never executes or downloads a stored command. It has no HttpApi or OpenAPI, no serialization adapters, no client-side Effect runtime and no admin UI beyond role management (round 1 cuts stand). Profile and guide authoring, also cut in round 1, came back after the first delivery (Profile and guide authoring, below).

## Synthesis decision

See `ARCHITECTURE.md`, section Synthesis. The grafts listed there amend this rationale and the sketch; implementation follows the grafts where they differ.

## Tradeoffs accepted

- We accept a `fns/` directory of one-line server fns in exchange for a boundary the test can police. The Start compiler would also let handlers live in route files, but then "never import server from UI" could not be checked by path.
- We accept writing each action's failure schema at the call (`runAction(RuleViolated, …)`) in exchange for a compiler check that it matches the program. This is the spike's variant B made generic.
- We accept about 29 kB gzip of Effect Schema in the browser in exchange for the same schema producing field errors client-side, with no second validator.
- We accept a transaction around every action, including the read-only guest evaluation, in exchange for writes that never remember to open one.
- We accept the composite FK `report_profile_fk` as a backstop of `mismatches` (same `Rule`, never the one that fires in-app), because it is a round 1 fixed decision and costs nothing.
- We accept text `app_user.id` and the password hash in `account` as documented deviations in exchange for not owning auth code.
- We accept that an old migration's `CHECK (… IN …)` reads today's literal list on a fresh DB (as in round 1). A new literal means a new migration.
- We accept the `/diagnostico/importar` page rendering client-only (`ssr: false`), because the fragment exists only in the browser.

## Alternatives considered

- **HttpApi as the single contract** (spike Q8: it works, typed errors arrive as real classes, and it produces OpenAPI). It exposes more to callers: a client layer per call site (about 8 lines), SSR loaders calling the handler in-process (not tried), and a second routing system beside Start's. It hides nothing we need, because OpenAPI has no consumer here. It lost on reader load and deadline, though it is the best answer if a second client ever appears.
- **A serialization-adapter registry for thrown errors.** It keeps `throw` semantics but makes failures invisible to the type system at the call site, and it needs a restart-sensitive global registry. It lost on rubric item 3: the compiler would not check that the UI handles failures.
- **Server fns inline in route files**, with no `fns/` directory. That means one fewer file per request, but a leak becomes a hydration crash instead of a test failure. It lost on enforceability.
- **Keeping a `users` table plus `COMMENT ON` mapping** (round 1). Its only justification was the Laravel kit, which no longer exists.
- **`bigserial` ids** (spike default). They cause bigint friction in every URL, key and log line for capacity we will never use.

## Implementation reconciliation

Once a unit lands, its code is authoritative and the sketch is history. The rule-home index lives in `MODULES.md`, section Rule homes.

| Unit | Deviation | Accepted because | Source |
|---|---|---|---|
| U0 | App at the repo root, `routeTree.gen.ts` gitignored, `docs/architecture/probes.md` | One app; the tree is regenerated by `pnpm check` | Synthesis amendment, U0 report |
| U0 | Nullable form fields send `"null"`; `NewReport.failures` defaults to `[]` | Probe (a) observed `fromFormData` semantics | `probes.md` |
| U1 | A profile freezes once reviewed or used by a report, not from creation | Section 8.5 and 8.9 say so; the doc wins over the sketch | U1 report, owner default (doc is the spec) |
| U1 | A machine's owner can change until its first diagnosis exists (trigger `og_owner_fixed`) | Section 8.3 "no transferible si ya hay pruebas" | U1 report |
| U1 | The sketch's partial index `reporte_aprobados_por_edicion` dropped | The doc's index on `report(edition_id, review_status, tested_at)` covers the same queries | U1 report |
| U1 + U2 | `report_profile_fk` is not mapped to a `Rule` | `mismatches` rejects first with `IncomparableProfile`; a hit is a writer bug and stays an infra error | Integration fix `762ca1b` |
| U2 | `NewReport` is one flat member per `Outcome`, no nested `ResultadoObservado` as in the sketch | Keeps the form error path at `["failures"]`; a union picks its member only on a single literal | U2 report |
| U2 | `planTransition` returns `'transicion_invalida'`; `decide` builds `InvalidTransition` | Avoids an import cycle between `errors.ts` and `review.ts` | U2 report |
| U2c | Route file `src/routes/[_]muestras.tsx` | `_muestras.tsx` is a pathless layout to the router generator | U2c report |

**U3** departs from the sketch as follows.

- **`useAction` binds `onSubmit`, not `<form action>`.** React 19 resets an action form's fields after every action, so a field error would wipe what the user typed. `submit` builds the FormData with the submitter, so `<button name="decision[_tag]" value="Aprobar">` still posts its value.
- **Field errors are keyed by the input's name.** A nested issue lands on `failures[0][detail]`, not on `failures`. A rule from `rules` still lands on its `field`. Decoding reports every invalid field at once.
- **No better-auth cookie cache.** With it, `pnpm set-role` and deactivation would take up to five minutes to apply. Each request reads the session from the database instead.
- **`assignRole` lives in `server/auth.ts`.** `pnpm set-role` and the seed share it, so role writes have one home. The accounts lane replaced it with `changeAccess` (section Accounts).
- **Demo content is marked by its author.** No table has a demo column. Every seeded profile and guide belongs to a `@demo.opengame.test` account (`demoDomain`), a reserved domain. A `hooks.before` in `server/auth.ts` rejects it on any `/sign-up/email` request that reaches `/api/auth` (`DOMINIO_RESERVADO`, shown under the email field), while the seed's in-process `auth.api.signUpEmail` carries no request and passes. Queries can derive "Datos de ejemplo" from the author's email.
- **`src/start.ts` adds Start's CSRF middleware for server fns.** A cross-site call gets 403.
- **Infra errors leave as a bare `Error`.** `runRead` and `runAction` log the full cause on the server, because Start serializes a thrown error's message to the browser, and a `SqlError` message carries SQL.
- **`Reviewer` is keyed by an unexported `unique symbol`**, not `Brand.nominal`, which any module could call.
- **Placeholder routes** for `/diagnostico`, `/guias` and `/revision` keep the header's links typed until U4, U5 and U6 replace them.

**U4** departs from the sketch as follows.

- **Path ids decode in the route, not in the server fn.** Each `$id` route has `params.parse` built by `routes/-ids.ts`, which throws `notFound()` for anything but digits, so `/juegos/1.0` is not a second address for `/juegos/1`. A server fn validator failure renders the error page, not a 404. The server fns take the branded integer, and an unknown id still comes back as `NotFound`.
- **The ficha ships pending reports as a count only.** Section 8.9 makes only the alias, the approved result and its technical context public, so the ficha has no pending rows (`pending` is a count) and no list of approved report cards. The matrix and the causes section show the approved evidence.
- **The catalog search is lenient.** `validateSearch` drops a value that does not decode instead of failing the page, and reads a title the router parsed as a number (`?q=2`) back as text. router-core keeps the raw query keys in `search`, so `loaderDeps` decodes again and the page reads `useLoaderDeps()`.
- **The four counters** are games with an approved report, approved reports, approved profiles, and distributions with an approved report.
- **Display labels come from `server/queries/labels.ts`.** A layer reads "Proton 8.0-5 (Valve)", and a profile reads "título rN". The same file holds the `@demo.opengame.test` test that sets the `demo` flag.
- **The profile page names why it has no evaluation.** `evaluation` is an `Evaluation`, `'perfil_en_prueba'` or `'sin_diagnostico'`.
- **Retired profiles and the evidence that used them.** An approved report keeps its profile's name in the matrix after the profile is retired, because the test ran with it. An approved solution that recommends a retired profile is hidden (8.9 "comprueba la vigencia").
- **`tests/queries.test.ts` writes approved rows with direct SQL.** U3 seeds no approved report, and the boundaries single-writer test scans `src/` and `scripts/` only. The rows satisfy the review-block CHECK and roll back with the test.

**U6** departs from the sketch as follows.

- **`server/commands/diagnostic.ts` is the single writer of `machine` and `diagnostic`**, not `contributions.ts`, so lanes U5 and U6 never share a file. `src/boundaries.test.ts` fails on an `INSERT INTO`/`UPDATE` of either table anywhere else.
- **Saving converges.** `submitDiagnostic` locks the user's row, reuses the user's machine with the same alias (case-insensitive) for `inserted`, and returns `{ id, inserted }`. A double click, a retry or a re-import of the same payload leaves one machine and one diagnostic.
- **Column limits are checked in `captureOf`.** `Capture` in `domain/contributions.ts` has unbounded text, so `server/diagnostics/payload.ts` checks the `tables.ts` limits and answers `campo_invalido` instead of an SQL error at INSERT. The parser also names a null `cpu_modelo` "CPU no detectada" (ARM kernels).
- **The manual form has its own schema**, `ManualForm` in `routes/diagnostico/-input.ts`. It covers only what a person types, with the column limits, and `manualInput` turns it into a `ManualCapture` taken now. That schema has no PCI id or library, which only a detector reads, so a manual entry cannot store a library the parser never normalized. Nullable selects post `"null"` ("No sé").
- **Paste and manual entries are evaluated twice.** `/diagnostico` evaluates first, so a bad paste keeps its error under the box. Then `/diagnostico/importar` evaluates again from sessionStorage. That page owns the result and the save. The read is cheap, and one result page is simpler than two.
- **`/entrar` and `/registro` accept `?volver=`** from a closed list (`/diagnostico/importar`), so a guest who signs in to save returns to the unsaved result.
- **The public origin comes from `BETTER_AUTH_URL`** (`server/origin.ts`), with the request URL only as a dev fallback. `originFn` and `/opengame-detect.sh` use it for the `curl … | bash` command. That route is allowlisted in `boundaries.test.ts`, like `/api/auth/$`.
- **The detector route imports the script inside its handler.** In a measured check, Start already stripped the handler from the client build even with a module-scope import. The bundle guard fails on `mem_info_vram_total` reaching the client, and a planted import in a component made it fail.

**U7 and U8**, with the integration leftovers, depart from the sketch as follows.

- **The step checklist lives in `localStorage` under the profile id and revision** (`ui/progress.ts`). `useSyncExternalStore` returns null on the server, so SSR and hydration render every step unchecked and the marks appear right after. A new revision starts clean. With blocked storage the checklist stays unchecked.
- **"Proponer una solución" on a ficha cause targets the newest approved report with that fallo.** A solution answers one fallo of one report (8.8), and the ficha groups causes across reports. `gamePage` returns that pair as the cause's `reply`.
- **`createGame` maps the two edition UQ constraints to rules.** `game_edition_game_launcher_uq` becomes `edicion_repetida` and `game_edition_external_uq` becomes `identificador_en_uso`, both on the `editions` field. The form starts each row on a different launcher by position, which avoids most accidental duplicates. The loader's `gameOptions` also calls `requireReviewer`, so a `usuario` gets a real 404, not only the route guard.
- **The seed writes captures through `submitDiagnostic`.** Part 1 catalog lookups (game, game_edition, profiles) stay raw SQL, so the seed does not go through `createGame`.
- **A merge had left two CSS rules without their closing brace.** Browsers parse nesting, so the diagnosis rules matched only inside `.block`, and the U5 rules, nested in `textarea` too, matched nothing. `src/styles.test.ts` now fails on nesting outside at-rules and on a selector styled in two rules.
- **`date` prints the Bogotá day, not the UTC day.** Its comment assumed DB `date` columns, but every stored time is a `timestamptz`. The `/_muestras` fixtures moved from UTC midnight to noon so they keep their calendar day. `fechaHora` (UTC, "p. m.") is gone, and captures print with `dateTime`.
- **Known gap, closed in U9.** A guest who followed "Reportar un resultado" or "Reportar resultado con este perfil" signed in and landed on `/`, because `?volver=` accepted only `/diagnostico/importar`.

**U9** departs from the earlier units as follows.

- **Every useAction form posts.** `useAction` returns `form` (`onSubmit`, `method="post"`, `noValidate`) and each form spreads it. With no method, a submit before hydration did a native GET, and `/entrar?correo=…&contrasena=…` put the password in the history and the server log.
- **`?volver=` names any page that needs an account.** `routes/-return-to.ts` parses the guard's own `location.href` into a `Destination`, a union of template literals rebuilt from the page's ids, so it can only name one of our pages. Each `beforeLoad` guard, `/diagnosticos/$id` included, sends `returnHere(location)`. `ReturnTo` always returns the `volver` key, because router-core spreads the validated search over the raw query: a validator that leaves a bad key out lets the raw value reach `useSearch()`.
- **The ficha offers "Proponer una solución" to guests**, like "Reportar un resultado". The form's guard sends them to sign in and back.
- **A pending report has no public page.** In the 8.10 walkthrough the second user proposes the solution after the reviewer approves the report, because 8.9 keeps pending reports private and the ficha links only approved ones.
- **Scrollable regions are focusable.** The copy box's `<pre>` and the ficha's matrix card take `tabIndex={0}`, so a keyboard can scroll them (axe `scrollable-region-focusable`). Form grids use `minmax(0, 1fr)` so a long `<select>` option no longer widens the page at 390px.
- **The catalog explains each state, and a diagnosis links the adoption guides** (wireframes 9.1 and 9.2). No rule picks a distribution from hardware, so the link replaces 9.2's recommended distributions.
- **Ports default to 3000 in `vite.config.ts`** for dev. The Nitro production server reads `PORT`.
- **A rate-limited sign-in says so.** better-auth's limiter answers 429 with no code in production; `routes/-account.ts` maps the status to "Demasiados intentos seguidos".
- **Coverage lives in `cobertura.md`**, with each requirement's route, program, tests, screenshots and gaps.

**Freshness and ProtonDB**, after the first delivery, add the following.

- **The state comes from the approved reports of the last 365 days.** `summarize(tests, now)` is the one state function for the ficha and the catalog, so their filters and counters cannot disagree. When no approved report is that recent, the state comes from all of them and `no_recent_confirmation` says so on the ficha and the card. Causes come from the same base set as the state, so a cause seen only in stale reports leaves the card and the `sin_anti_cheat` filter once a recent report exists. `now` is a required argument, read once per loader from Effect's `Clock`; `domain/` never reads a clock. `combinar` is gone: merging summarized environments cannot apply a per-row window.
- **An edition's regression ignores the window.** When an edition's newest approved report fails after an earlier one worked, the ficha says "Dejó de funcionar" with that report's date, version and layer, however old it is. Same-instant reports are ordered by id.
- **Dates always print the year.** The rule asked for the year only on dates before the current year. That needs `now` on the browser too, and every page that prints a date would have to receive the server's `now` to hydrate the same text. Always printing the year gives the same protection, stays deterministic, and needs no plumbing.
- **ProtonDB is stored as one aggregate row per catalog Steam edition, never as reports.** The UI may show only aggregates (8.9), and the catalog must not load rows per request. Every number the ficha and the card show is computable at import time, so `protondb_summary` holds those counts and nothing else: privacy holds by construction, the card line is one small query, and we hold a handful of counts, not a derived database. Changing what an aggregate means takes a rerun of the last export from a file or stdin, because `--latest` skips an export it already imported.
- **ProtonDB's "last year" ends at the export date, not at the request.** Without stored reports, the window can only be computed at import time. The export date is the newest report in the file, and the ficha prints it next to the numbers, so they read as a dated snapshot. `isRecent` in `domain/recency.ts` is the window for both sources.
- **The import reads the whole export, then replaces every row in one transaction.** It streams the top-level array with a hand-written splitter (the October 2026 file is 529 MB, just under V8's maximum string length) and parses each element with `JSON.parse` and a boundary Schema. A rerun converges, an empty or truncated file fails before the transaction, and an export older than the stored one is refused. A record over 4 MiB is counted as discarded rather than failing the import: the October 2026 export holds one with 1 MB of notes. A record dated after the import is discarded too, since it would move the export date forward and lock out every real export after it. About 8% of the records carry the appId as a number. `notListed` is read as no layer.

## Follow-ups after the first delivery

Found by the pre-PR comment audit. None is a correctness bug; each would make an illegal state unrepresentable or remove a hand-synced copy.

- `RequirementCheck.required` and `detected.value` hold either MB or a Vulkan version in one string. A union tagged by `requirement` would remove the `Number()` parse in `EvaluationChecklist`.
- `Personal` (`VerdictForMe`) and the FPS fields of `ApprovedTest` are sets of nullables whose combinations mean different things. Each should be a tagged union or one nullable struct, like `FpsMeasurement`.
- `FpsMeasurement.avg_fps`'s maximum copies `numeric(7,2)` by hand, and the failure-type codes live in both `scripts/seed.ts` and `ui/vocabulary.ts`. Derive both from one source.
- Migrations build their CHECK lists from today's literal Schemas, so an old migration renders different SQL after a literal changes. Snapshot the lists per migration before the first real deploy.
- `submitDiagnostic` serializes per user with a row lock. A unique index on `(user_id, lower(alias))` with `ON CONFLICT` would make convergence structural.
- `ui/samples/fixtures.ts` is hand-written and could be derived with `summarize` and `evaluate`.
- `pnpm db:up` from a second checkout recreates `opengame-pg` because the init-script mount path differs per checkout. The data survives, but connections drop.
- Open product gaps from `cobertura.md`: no game editing after creation (RF-03), no distribution recommendation from hardware, no "hardware modesto" filter (wireframe 9.1).

## U10: Windows detector, GPU projection and Steam library

**Problem.** The target player has an old PC that still runs Windows 10. In the interviews, 9 of 10 wanted to know whether their games run on Linux before migrating, and 8 of 10 feared losing their library. Until U10 the app answered only on Linux. A Windows player filled in the manual form, and the Vulkan version they typed came from the Windows driver, which says nothing about Linux.

**Shape.**

- `detector/opengame-detect.ps1` is the Windows twin of the bash script. `irm <origen>/opengame-detect.ps1 | iex` reads the OS, the CPU, the installed RAM, the GPU's name, PCI id and VRAM, and the installed Steam games. It needs no admin rights and makes no network call. It hands off through `/diagnostico/importar#d=` like bash. When that URL is over 2000 characters, it copies the JSON to the clipboard and opens `/diagnostico?pegar=1`, which focuses the paste box. `Start-Process` opens a URL through ShellExecute, which cuts it at about 2048 characters, so a library of a few dozen games already takes the clipboard path.
- Both detectors send `gpu_pci_id` and `biblioteca_steam`. The payload stays `version_esquema: 1`. `parsePayload` picks a member by `sistema`, and the Windows member has no Vulkan keys and no kernel driver, in the payload and in `Capture`. Its row stores those columns as unknown. The manual form asks for Vulkan only on Linux.
- Migration `3_gpu_biblioteca` adds `gpu_pci_id varchar(9)` and `steam_library jsonb` to `diagnostic`, each with a CHECK. It does not backfill, because captures are immutable. An older row has no PCI id, and the card asks the user to run the detector again.
- `server/gpu/capability.ts` `machineOnLinux` turns the stored columns into what `evaluate` consumes, plus the data for "Tu tarjeta gráfica en Linux". The diagnosis, the ficha and the profile page all call it, and nothing else builds `Capabilities`. Vulkan follows one precedence: Linux Vulkan measured by `vulkaninfo`, then the family's projection, then `desconocido`. A Windows row's stored Vulkan is never read.
- `MachineVulkan` carries its `origin` whenever support is known. Its level is a range: a measured version is a one-point range, and a projection can be wider because some levels are unverified. `evaluate` answers `cumple` only when the whole range meets the minimum, `no_cumple` when none of it does, and `desconocido` when the range straddles it, so an unverified level never gives a false `cumple`. The UI labels each value "Detectado" or "Proyectado".
- The library read model matches app ids against Steam's `game_edition.external_id`. `matrix` marks each row `in_library`, so library games get the same evaluation as every other game. Games the catalog does not know are listed by name with a link to their Steam page.

**The Linux capability is projected from the PCI id and never stored.** The PCI id is the fact the detector reads, and it does not go stale. What a family can do on Linux changes with Mesa and kernel releases. A stored projection would freeze today's answer into an immutable row, and after the next `pnpm gpu:generate` old and new rows would disagree about the same GPU. Projecting at read time keeps sentence 4 of `ARCHITECTURE.md` true. The id table is generated from pinned Mesa, Linux and pci.ids sources, so a reviewer can rerun the generator and diff its output.

**The library is read on the player's machine, not through the Steam Web API.** `GetOwnedGames` needs an API key the server keeps secret, a public profile with public game details, and rate limiting, and it would be the app's first outbound HTTP call. The detectors already run on the player's machine, where `steamapps/libraryfolders.vdf` and the `appmanifest_<appid>.acf` files are plain files the user can read. That works with a private profile and sends nothing until the user chooses. The cost is that it lists installed games, not every owned game. For a player deciding whether to migrate, the installed games are the ones that matter first.

**The library is private by default.** It is stored only when the user checks "Guardar también mi lista de juegos de Steam" (`with_library`). The box starts unchecked because storage cannot be undone: diagnosis rows are immutable and nothing deletes them. It shows only when the capture has a library. Only the owner can read a saved diagnosis, and saving the same capture again keeps the first choice.

**Two cuts reversed, in a narrow form.** `PLAN.md` cut "Windows comparators" and "PCI device database" for the first delivery. U10 reverses both, narrowly. The PCI database is a generated, server-only table from device id to one of 15 families, with no device picker and no per-model page. The Windows comparison is the Windows detector plus a projection labelled as one. There is still no Windows 11 versus Linux RAM comparator and no FPS estimate.

**Alternatives considered.** Three designs ran in parallel. The synthesis and the cross-judge (Fable) picked the same base, which the judge scored 27 against 24 and 16.

- **A separate library table with its own privacy guard.** The jsonb column needs no new table, trigger or single-writer rule, and the owner-only read already exists.
- **Storing the projected family or Vulkan level on the row.** Rejected for the staleness reason above.
- **NVIDIA ids scraped from the driver README.** Nobody probed it, and pci.ids already names every NVIDIA chip's codename.
- **`ConvertTo-Json` in the PowerShell script.** Its output differs between Windows PowerShell 5.1 and pwsh 7. The script builds its JSON by hand and escapes every non-ASCII character.
- **A test-only fixture branch in the shipped script.** The tests shadow `Get-CimInstance` and the other cmdlets with stub functions (`src/detector/fixtures/stubs.ps1`) and run the real script.

**Open questions and risks.**

1. On a hybrid laptop, bash projects the first DRM card, which can be the integrated GPU. The PowerShell script picks the adapter with the most VRAM (ties go to NVIDIA, then AMD, then Intel), so a Ryzen iGPU listed before a GeForce does not win.
2. The Haswell (Vulkan 1.0 to 1.1) and Broadwell (1.1 to 1.2) ranges are unverified. Both show the warning `vulkan_sin_verificar` until someone reads `vulkaninfo` on that hardware.
3. No run on a real Windows PowerShell 5.1 was possible. A static test rejects PowerShell 7-only syntax and non-ASCII source, and the behavior tests run pwsh 7 against stubbed cmdlets.
4. The library match joins on `launcher.name = 'Steam'` (`STEAM_LAUNCHER`), a string key older than U10. Renaming that launcher row would turn every library game into an unknown game.
5. An id the table does not list projects nothing; the card says the GPU is not recognized. The table has no ids for AMD's IP-discovery parts (Radeon RX 7000 and newer), which `amdgpu_drv.c` matches by class, so those cards get no projection yet. A guessed "newest family" was tried and removed: it projected Vulkan 1.3 to 1.4 for PowerVR and pre-GCN parts that are also missing from the sources.
6. A pasted payload over 300 000 characters fails the server fn validator and shows a generic error, not a field message. A full library of 1000 games with 120-character names is about 200 000 characters in base64url, so a real detector stays under the limit with ASCII names. PowerShell writes a non-ASCII character as `\uXXXX`, so a full library of long non-ASCII names can exceed it.

## Accounts: "Mis aportes" and role management

**Problem.** A user who sent a report or a solution could not find it again. A pending one has no public page, and a rejected one disappeared with the reviewer's reason, so the author never learned what to fix. Roles changed only from a shell on the server, with `pnpm set-role`.

**Shape.**

- `/mis-aportes` reads `myContributions` (`server/queries/contributions.ts`): one query per kind, for reports, solutions and profiles, plus `myMachines` for the saved diagnostics and `myGameRequests` for game requests. A new kind of contribution is one more query, one more key and one more section. Each item links to its game, a profile to its page while it is active, and a diagnostic to its page.
- The review reaches its author as `AuthorReview`, a union in which only `rechazado` and `retirado` carry the reason. The query reads the reason for every state and decoding drops it from the active member, so an approval's reason never leaves the server. No page names the reviewer, so this one does not either.
- Profiles are listed with the other kinds. Profile authoring came later and added only the form (Profile and guide authoring).
- A report that `protonReportPossible` admits, while it is active, links "Prepara el informe para Valve". The "Reporte enviado" panel was the only way to reach that page.
- `/admin/usuarios` lists the 50 newest accounts, or those whose alias or email contains the search (`strpos`, so `%` and `_` match themselves). Each account is one form that posts its whole `AccessChange`: role and active flag. An administrator's own row has no form.
- `changeAccess` (`server/commands/accounts.ts`) is the single writer of `app_user.role` and `app_user.active`, for the page, `pnpm set-role` and the seed. `src/boundaries.test.ts` fails on any other `UPDATE app_user` of those columns. It locks the target and every active administrador in id order, so two administrators who demote each other at once serialize, and the second one sees that it would leave none. An administrator never removes their own access (`acceso_propio`), and the last active administrador keeps it (`ultimo_administrador`). `pnpm set-role` passes no actor, so it can create the first administrador but cannot demote the last one. It also reactivates the account, so it is the way back for an administrator another one deactivated.
- **A demo administrador manages only demo accounts.** `demo_admin`'s password is in the README, and the deploy steps seed the demo data. On a deployed site anyone could otherwise read every email and deactivate the operator. `accounts` lists only demo accounts to a demo administrador, and `changeAccess` answers `NotFound` when one acts on a real account. The demo still shows every control.
- **`active` has a real effect, so the page offers it.** `visitorOf` already turned a deactivated account into a guest on every request. Signing in still succeeded, though, and the user stayed a guest with no explanation. A `databaseHooks.session.create.before` hook in `server/auth.ts` now refuses the session with `CUENTA_DESACTIVADA`, and the sign-in form says the account is deactivated. The hook runs after the password check, so it tells nothing to someone without the password. Deactivating also deletes the account's sessions in the same transaction: `visitorOf` ignored them, but better-auth's own endpoints, such as `update-user`, still accepted them, so a deactivated account could rename its public alias.
- A change applies on the account's next request, because sessions are read from the database (U3, no cookie cache).

**Alternatives considered.**

- **A trigger for the last administrador.** The rule spans rows, and the app's cross-row rules live in their writer.
- **Separate actions for the role and for deactivation.** One form per account and one writer is less code, and the guard sees the whole change at once.
- **Sharing the catalog's lenient search Schema.** It lived in `routes/index.tsx`, which the catalog lane was rewriting. `/admin/usuarios` reads `q` with a three-line function instead; the catalog lane has since moved the Schema to `routes/-search.ts`.

## Game page: version history and follows

**Problem.** A player wants to know which Wine or Proton versions worked for a game, from when, and whether one broke it, and to hear when a game they care about changes. The app has no mail channel, so following is in-app only.

**Shape.**

- `timeline` in `domain/compatibility.ts` groups the approved tests by layer version, in the order each version was first tested. Version strings do not order across families (Proton 9.0-3, GE-Proton 10-1, Wine 9.0), so the test date is the honest order. It is history, so no window applies, as with regressions, and each step prints its dates. "Dejó de funcionar" stays one rule: `regressionsOf` feeds both `summarize` and `timeline`, and `Regression` now carries the layer version id, so the step where an edition broke is matched by id.
- A follow is one `game_follow` row per user and game with `seen_at` and `created_at`, and nothing else. `newsSince` in `domain/follow.ts` counts the reports approved after `seen_at` and compares the state computed at `seen_at`, from what was approved by then, with the state now. `ApprovedTest` gains `reviewed_at`, the approval instant. A retired report counts in neither state: retiring overwrites `reviewed_at`, so its approval instant is gone, and a retired report never counts anyway. The state can also change with no new approval, when the year window passes the evidence. That counts as news, because the ficha would show another state.
- "Marcar como visto" is an explicit action, not a write in a loader: the router runs loaders on preload and on every invalidation, and a read that writes would mark news seen that nobody saw. The form posts the page's watermark (`as_of`), and `changeFollow` sets `seen_at` to the earlier of it and now, forward only. The watermark is Postgres `now()`, read before the approved tests, because `reviewed_at` comes from that clock and not from the app's: a report approved while the page sat open stays news. `reviewed_at` is the start of the approving transaction, so only an approval still uncommitted during the read can fall behind the watermark. The watermark sits one millisecond back, because the driver decodes timestamps to the millisecond.
- The header count comes from the root route's `beforeLoad`, which already ran on every navigation for the visitor. `session` returns the visitor and the count from the same `followed` read model as "Seguidos", so the two cannot disagree. For a signed-in visitor that costs two queries per navigation, and per link preload (`defaultPreload: 'intent'` runs the root's `beforeLoad` too): the follows, and their games' approved tests.
- A follow is the user's own bookmark, not evidence, so its row goes with its user or game (`ON DELETE CASCADE`). `?volver=` now also accepts the public game page, where "Entra para seguirlo" sends a guest, and `/seguidos`.

**Alternatives considered.**

- **Marking seen when the ficha opens.** Simpler to use, but it needs a write on a GET or an effect after render, and either one marks the news seen before the player read them.
- **Storing the state at `seen_at`.** It would make "the state changed" one comparison, but it is a stored verdict that goes stale with the window and with retirements. Computing it from `reviewed_at` keeps sentence 4 of `ARCHITECTURE.md` true.

## Profile and guide authoring

**Problem.** Profiles and adoption guides came only from the seed, so the profile page had nothing a player could add and the spec's "Solo revisores publican guías" had no code home (`PLAN.md` cut "profile and guide authoring").

**Shape.**

- Any signed-in user proposes a profile from the game page (`/juegos/$gameId/perfiles/nuevo`): the environment (edition, distribution, layer version, architecture), the content (title, target game version, RAM, VRAM and Vulkan minimums, CPU and GPU notes, launch options) and ordered steps and dependencies. A dependency is picked from the catalog or typed as a new one, which upserts like a new layer version. The profile is `pendiente` and enters the existing queue on `/revision`; approval still needs an approved working report that used it.
- Its author edits it on `/perfiles/$profileId/editar` while it is pending and no report or solution points at it. One SQL expression, `profileEditable` in `server/commands/contributions.ts`, decides that for the writer and for the profile page's «Editar la propuesta». The DB trigger `og_profile_frozen` still freezes a reviewed or tested profile, and now maps to the rule `perfil_congelado`.
- An approved, rejected or used profile changes only through a new profile. «Proponer una versión con cambios» opens the form filled from it (`?desde=`): any public profile, or one of your own whatever its status, so a rejected author can rework theirs. A new profile takes the next `revision` of its environment, so a second proposal for the same edition, distribution, layer and architecture is r2.
- "Mis aportes" links its author's editable proposal to the edit form, and a rejected or retired one to «Proponer una versión con cambios».
- Reviewers and administrators create and edit guides on `/guias/nueva` and `/guias/$guideId/editar`. `createGuide` and `editGuide` call `requireReviewer`, which is the code home of "Solo revisores publican guías". Readers still see only published guides; reviewers also see drafts and archived ones, so they can reach them to edit.
- Every write lives in `server/commands/contributions.ts`, and `src/boundaries.test.ts` fails on an `INSERT`, `UPDATE` or `DELETE` of `profile`, `profile_step`, `profile_dependency` or `adoption_guide` anywhere else. The seed now proposes its demo profiles and writes its guides through those writers.

**The way back is deleting, not a new status.** The author of a pending profile nobody used can delete it, with its steps and dependencies. `rechazado` and `retirado` are a reviewer's verdicts: the review block requires a reviewer, a date and a reason, and `decide` forbids reviewing your own contribution, so an author's withdrawal cannot honestly be either. A pending, unused profile is evidence of nothing, so deleting it loses nothing. Once a report or a solution uses it, it stays, and a reviewer rejects or later retires it as before.

**The environment is fixed at birth.** Editing changes the content, not the edition, distribution, layer or architecture. Those name what the profile is for, decide its revision number and are what a report is compared against. A wrong environment means deleting the proposal and proposing again.

**A guide's revision counts what readers see.** Editing the type, distribution, title or text bumps `revision` and `updated_at`. Publishing, archiving or returning to draft does not. Any reviewer can edit any guide, and the author stays the reviewer who created it. Guides keep their plain-text format: a blank line separates paragraphs and a single line break is kept.

**Alternatives considered.**

- **Letting the author move a pending profile to `retirado`.** It needs a new transition, a reviewer id that is the author, and an exception to the self-review rule.
- **Freezing a profile at its first save and versioning every edit.** A pending profile is a draft until someone tests it, and the existing trigger already freezes it at that moment.
- **A separate writer module for guides.** Guides are reviewer-written catalog content like games, which `createGame` already writes from the same module.

**Open questions and risks.**

1. Two proposals for the same environment in the same instant collide on `profile_revision_uq`; the second gets the generic error and can resend.
2. A pending profile is public so others can test it, and now anyone can write one. Its page says no reviewer has read the steps and asks readers to check each command before running it.
3. The profile page keeps a player's step checklist under the profile id and revision. Editing a pending profile keeps both, so a checklist can point at steps that moved.
4. A new dependency typed by any user becomes a catalog row others can pick, like a new layer version from a report.

## Catalog search, game requests and Steam autofill

**Problem.** A search for «cyberpnk» found nothing, and a game missing from the catalog had no way in except a reviewer who happened to think of it. Reviewers also typed every new game's title and description by hand.

**Shape.**

- Migration `9_catalog` creates `pg_trgm` and a GIN trigram index on `game.title`. `catalog` keeps the substring match and adds `q <% title`, then orders by `word_similarity(q, title)`. The threshold is the extension's default, 0.6: on the seeded titles every typo the tests try scores 0.62 or more, and the closest miss («theft» against «The Witcher 3: Wild Hunt») scores 0.5. `pg_trgm` is a trusted extension, so the database owner creates it without superuser; that was checked with a non-superuser owner.
- `game_request` holds one row per requested game and `game_request_user` one row per requester. A request is `abierto` until a reviewer fulfils it by creating its game (`cumplido`, linked to the game) or rejects it with a reason (`rechazado`). The CHECK `game_request_resolution` shapes each state, like the review block. `/pedidos` lists the open requests by requester count, and "Mis aportes" shows each user's own requests in every state (`myGameRequests`), so a requester follows a request where they follow everything else they sent. Every catalog search links to `/pedidos` with the search as the title.
- `server/commands/game-requests.ts` is the single writer. A new request joins the open one with the same Steam App ID, or the same title (letters and digits, case-folded) when either side has no App ID; a game already in the catalog, matched the same way against its Steam edition, is pointed to instead. Every writer locks `game_request` first, so two first requests for one game cannot both create it. A request that joins one without an App ID gives it its own. The last requester to withdraw deletes the request. `createGame` fulfils, in its own transaction, the request it started from and every other open request that asks for the new game, so a request is never `cumplido` without its game and never stays open once its game exists.
- Fuzzy search can stand a near miss in for a missing game («The Witcher 2» finds The Witcher 3), so the request link shows under any search, not only an empty one.
- `server/external/steam.ts` calls the store's `appdetails` endpoint, with a 5-second timeout, for reviewers only, and fills the title, the plain-text short description and the Steam edition. Nothing is stored until the reviewer submits the form.

**Requests are not reviewable contributions.** A request is not evidence about a game, so the review block, `decide` and its author ≠ reviewer rule do not apply. It gets its own small table and writer instead of a fourth reviewable type.

**Identity is exact, search is fuzzy.** Requests deduplicate by App ID or normalized title, never by similarity: two DOOMs with different App IDs are two games, and a similarity merge would join requests for different games silently. The cost is that «cyberpnk» typed into the request form opens a second request, which a reviewer rejects as a duplicate.

**The first outbound HTTP call.** U10 kept the server off the network. The store's public endpoint needs no key and runs only when a reviewer asks for it, so a failure costs one message and a hand-filled form. The call goes through `runAction` like every call with a typed failure, so it holds one pooled connection for up to 5 seconds. Graphics APIs stay manual: PCGamingWiki's Cargo API answers server requests with a Cloudflare challenge, so it cannot fill them reliably. Covers stay the generated art; the app shows no third-party images.

**Alternatives considered.**

- **Similarity in SQL with an explicit threshold** (`word_similarity(q, title) >= 0.6`). It reads clearer but cannot use the GIN index; the operator uses it, and the test pins the default.
- **Joining requests by similarity.** Rejected for the reason above.
- **Requests in the review queue.** `/revision` decides reviewable contributions; a request has no evidence to approve.

**Open questions and risks.**

1. A typo in a requested title without an App ID opens a second request. Listing similar open requests next to the form would catch most of them.
2. A game created with no Steam App ID closes every open request with its title, including same-title requests with different App IDs (two DOOMs). Giving the Steam edition its App ID avoids it.
3. The store API is commonly reported to allow about 200 calls per 5 minutes per address; Valve documents no limit. One reviewer pressing the button stays far below it.

## Detector report mode and Steam Deck

**Problem.** Reporting a result asks for the exact compatibility layer, and players do not know which Proton release Steam ran. The Steam Deck, the most common Linux gaming machine, had no place in the data: its reports looked like any SteamOS desktop's.

**Shape.**

- `opengame-detect.sh --game <appid>` adds a `juego` block to payload v1, an optional key like the system facts before it. Proton writes the build that last ran a game into the game's prefix: line 2 of `compatdata/<appid>/config_info` is that build's fonts folder (Proton 8 to 10 and Experimental agree). Every build carries a `version` file, where Proton's build writes `<time> <git tag>`, so the detector reports `proton-9.0-2` for the build that actually ran. When `config_info` names no readable build, it falls back to `config/config.vdf`: the game's own entry, else, if a prefix exists, the default under `"0"`, which Steam applies only to Windows titles. An installed game with no prefix and no tool is native; a game the detector cannot see is unknown, never native. Launch options come from the localconfig.vdf of the account marked `MostRecent` in loginusers.vdf, and the build from the appmanifest. The VDF reader now prints each value's full key path, since these files nest the same key names.
- The hand-off is the existing one. `/diagnostico/importar` names the game by its Steam edition, saves the diagnosis (signing in first; the payload waits in sessionStorage as before), then opens `/juegos/$gameId/reportar` with the diagnosis, the edition and the `steam` block in typed search params. Search params survive a reload and SSR. As before, nothing is stored before the user saves: the guest evaluation posts the payload but writes nothing.
- `prefillLayer` matches the catalog only on an exact release (`proton-9.0-2`, `GE-Proton9-4`; a release starts with a digit, so `proton-cachyos` is not one). A Valve tool name without its version file names a series that Steam keeps updating, so the form starts on "Otra versión" with the family and variant and an empty version, and says where to read it. A native game starts on the Nativo family, and nothing picks one of the native layers for the user; an unknown tool leaves the layer to the user. The report has no launch-options field, so they go into the observations, and the form says so. The test time starts at the capture, the earliest a report accepts, because the detector runs after the game was played.
- SteamOS reports its point release (`3.7.13`) every few weeks, so the parser keeps its minor release for the detector and the manual form, like `VERSION_ID` already does for Ubuntu and Mint. Otherwise each update would start a new distribution and split the Deck's environments. SteamOS captures saved before this change keep their point release, since captures are immutable.
- `diagnostic.device` (migration `10_detector`) stores the Deck model the detector reads from DMI, or the manual form's choice. Like the PCI id, it is a fact about the capture. "En Steam Deck", the matrix label and "Probado en Steam Deck" are computed from approved reports on each request, and a Deck is its own environment in the matrix.
- The Deck APUs (Van Gogh `1002:163f`, Sephiroth `1002:1435`) were missing from the GPU table: amdgpu matches them by PCI class, so `amdgpu_drv.c` names no id. `pnpm gpu:generate` now takes those two from the pinned pci.ids by codename. Other IP-discovery parts stay unprojected (U10, risk 5).

**Alternatives considered.** Guessing a series' release from the catalog (one 9.0 in the list, so pick it) was rejected: a wrong minor version is evidence about another build, and the catalog already avoids projecting what it did not measure. Saving the diagnosis and the report in one action was rejected: two single writers would share one program, and the user would lose the "nothing is sent until you review it" step. Storing the game block on the diagnosis was rejected: it describes one game, not the machine.

**Open risks.** `config_info` is never removed, so a native game once forced to Proton still reports that build. Flatpak Steam writes paths from inside its sandbox there (`~/.local/share/Steam/…` for what the host sees under `~/.var/app/com.valvesoftware.Steam/`), so the detector misses the build, or reads a native Steam's build of the same name when both are installed. With a prefix whose `config_info` names no readable build, the detector trusts `config.vdf`. That misses the tool Valve assigns some titles in `appinfo.vdf`, a binary file it does not read, so it may report the `"0"` default instead. The Valve tool lookup in that fallback maps an app name like "Proton 9.0" to `proton_9` by Valve's naming habit, so a renamed tool falls back to the series with an empty version. With several Steam accounts and none marked as the last one used, the launch options are the first account's, and the form says so.

## AreWeAntiCheatYet and scheduled imports

**Problem.** Anti-cheat is the most common reason a game does not run online on Linux, and OpenGame learned about it only from approved reports. [AreWeAntiCheatYet](https://areweanticheatyet.com) keeps a community list of games with anti-cheat and their status on Linux, under the MIT license. Separately, the ProtonDB import ran only when someone downloaded the monthly export and piped it in.

**Shape.**

- `pnpm db:anticheat` imports AWACY's `games.json` the way `pnpm db:protondb` imports ProtonDB's export. It reuses `arrayElements`, matches entries by the Steam edition's appId, and replaces `anticheat_entry` in one transaction (single writer `server/external/anticheat.ts`). It stores only what the page shows: the status, the anti-cheats, the date the list changed the entry and the slug for the link. Notes and the update history stay on AWACY's page, because they are English prose that OpenGame would show untranslated.
- When two entries name the same appId (a renamed game, a re-release), the most recently changed one wins. A date that does not parse is stored as unknown, because one entry in the October 2026 list has a malformed date and its status still matters.
- `--latest` on either command reads one GitHub contents listing, picks the file (ProtonDB's newest `reports_<month><day>_<year>.tar.gz` by the date in its name, or AWACY's `games.json`) and compares its git blob sha with `external_import`. That table holds, per source, the sha and a digest of the catalog's Steam app ids that the last `--latest` import read. Each importer writes it in its own transaction (single writer `server/external/sources.ts`), and a file or stdin import deletes the source's row, so the next `--latest` downloads again. Each download must hash to the listed size and blob sha (`checkedAgainst`), because the branch URL that serves `games.json` can return the previous content for a few minutes after a commit. Recording the new sha with old bytes would skip the new list until the next commit. The check fails at the last byte, before the importer writes anything, and the next run tries again.
- The ProtonDB export streams from the HTTP body through `DecompressionStream` and a small tar reader (`tarFile`) into the existing JSON reader. Nothing is written to disk. The October 2026 export took 9 minutes at 200 KB/s and peaked at 200 MB of memory.
- `compose.prod.yaml` gains an `imports` service on the same image. `scripts/scheduled-imports.sh` waits until `app` serves, which happens only after `app` applied the migrations, then runs both `--latest` imports once a day. `SCHEDULED_IMPORTS=off` turns it off.

**AWACY's Broken and Denied feed the anti-cheat filter, never the computed state.** The state is a promise that reviewers approved the evidence, so an outside list cannot move it. The "Sin bloqueo anti-cheat" filter answers a narrower question: which games a player can expect to play online. An approved anti-cheat failure and AWACY's Broken ("will not run online due to the anti-cheat") or Denied ("the developers will not enable it") are both evidence of that, so the filter hides a game when either source says so. The card names AWACY as the source when it is the reason. Supported, Running and Planned show only on the game page, because a card line for every listed game would crowd the catalog.

**The digest of the catalog's Steam games is part of what `--latest` compares.** With the blob sha alone, a game a reviewer adds would wait for the next monthly ProtonDB export to get its numbers. With the digest, the next daily run sees the new app id and imports again. A file or stdin import leaves nothing to compare, because its origin is unknown.

**The schedule is a service of its own, not part of the app.** Alternatives considered:

- **Nitro scheduled tasks.** They are experimental in this Nitro beta and run inside the server process. The ProtonDB import parses 529 MB of JSON, which would hold the event loop that serves pages, and running out of memory would take the app down.
- **Coolify Scheduled Tasks, or host cron.** The schedule would live outside the repository, and the plain Docker deployment would not have it.
- **One long-running Node scheduler.** A crash would restart the container and run the imports again at once, so an import that runs out of memory would loop, downloading 70 MB each time. In the shell loop each import is its own process, and a failure waits until the next day.

The service waits for `app` instead of running `pnpm db:migrate` itself. The migrator locks its table, but on a new database two migrators can race to create that table, and the one that loses could be `app`.

**The tar reader is hand-written.** The export is one GNU tar entry, and reading 512-byte headers and checksums takes about 40 lines. A dependency would be the import's only one, and piping through the system's `tar` would tie the import to the image's tools and test `tar` rather than our code. `tarFile` skips other entries and fails on a bad checksum, a truncated archive or a missing `.json`.

**Open questions and risks.**

1. GitHub allows 60 unauthenticated API requests an hour per IP address. The schedule makes two a day, but other software on a shared address counts against the same limit. A refused request is logged and tried again the next day.
2. A list that shrinks by mistake upstream would replace the stored entries. Only an empty or unreadable list is refused.
3. AWACY lists only games with anti-cheat, but it gives no Steam id for about 40% of its entries, and a game without a Steam edition cannot match at all. A game without an entry reads "Sin datos de AreWeAntiCheatYet" and says the match is by Steam edition, never "no anti-cheat".

## Open questions and risks

1. Does `Schema.fromFormData(Schema.toCodecStringTree(S))` decode the report form's nested shape (`failures[0][failure_type_id]`, the `layer_version[_tag]` union, a null `profile_id`) at runtime? It typechecks. If not, U0 falls back to a controlled form object decoded with plain `Schema.decodeUnknownResult(S)`, and the hook signature stays the same.
2. Does better-auth 1.7.7 accept `fields` mappings for `createdAt`, `updatedAt` and `emailVerified`, plus `additionalFields`, and create those columns? The spike verified only name and email. The fallback is better-auth's camelCase for those three columns, recorded with `COMMENT ON`.
3. Does `@effect/sql-pg`'s native driver return `numeric` as a string and `text[]` as an array? A 10-line probe in U0 settles it, and the fix is a one-word Schema swap.
4. Will the panel accept `app_user.id` as text, and the hash living in `account`? The alternative, `generateId: 'serial'` (unverified on 1.7.7), would make `id` an integer.
5. Native Linux games: we default to `family = 'Nativo'`, carried from round 1 open decision 2. Is that acceptable?
6. Strict "Resultados variables" (funciona + funciona_con_ajustes shows purple), carried from round 1 open decision 5. Keep it?
7. Defense hosting: settled after U9. Nitro builds a Node server (`pnpm start`), and `compose.prod.yaml` runs it in Docker with PostgreSQL 18 on a VPS under Coolify. See the README.

## Next implementation step

U0: scaffold with the spike's exact command and pins, drop in `sketch/src/dominio` and `boundaries.test.ts`, and run the three 2-hour-capped probes (form decode, auth field mapping, driver types). That ends with `pnpm check` green.

## Evidence (run while sketching, in /tmp/arena2-opus against the spike's node_modules; nothing installed in the repo)

- `tsr generate && tsc -p .` gives 0 errors over all of `sketch/src`, `tests`, `scripts`, with strict, `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`.
- Negative type checks:
  - Removing `ApprovalBlocked` from `decideFn`'s failure schema fails with "AprobacionBloqueada is not assignable to ReglaIncumplida | Control | Infra".
  - Removing its `case` from the review page fails with TS2366.
  - Removing `resultados_variables` from `vocabulary.ts` fails at every use.
- `vite build` passes. `dist/client` has no match for better-auth server code, `PgClient`, `withTransaction`, `getSession` or the SQL. The Effect Schema chunk is 29.2 kB gzip, against 98 kB for React + router.
- `vitest run src` passes `boundaries.test.ts` (7 tests) and `statusOf`. Three planted violations each failed the matching test with its fix message: a module-scope `const` in `fns/`, a route importing `server/auth.ts`, and an `UPDATE … SET review_status` in `contributions.ts`.
