# OpenGame Linux on TanStack Start + Effect 4 + PostgreSQL 18: design rationale

Sketch: `sketch/` (typechecks with `tsc` 7.0.2 strict + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`, and `vite build`s, against the spike's installed packages; see Evidence). Module map: `MODULES.md`. Build plan: `PLAN.md`.

## Problem

Same product, same section 8, same round 1 domain decisions; the stack changed to React 19 + Effect 4 + PostgreSQL 18 on TanStack Start. Section 8 is the spec: 17 tables, a review block on three of them, and about 25 rules. The domain shape is settled. The stack decides five things the spike made non-obvious:

- **Start loses thrown errors.** A thrown `Schema.TaggedError` reaches the browser as `new Error("")`, and in-process SSR hides this (spike Q3, gotchas 4 and 9).
- **Server-fn files leak their module scope into the client bundle.** That put `pg` in the browser and broke hydration (gotcha 3).
- **better-auth owns its tables and its own `pg` Pool.** It maps `usuario.alias` and `usuario.correo` fine, keeps the password hash in `account.password`, and uses text ids (Q7).
- **The driver has traps.** `int8` decodes as `bigint`, which `JSON.stringify` rejects. PG error fields are untyped. A `sql.unsafe` call takes one statement only (Q5, Q6, gotchas 5, 7, 8).
- **The deadline is 2026-10-20**, with 3 students plus agents and 8 working days.

## Usage (caller's view)

**The ficha loads.** One route file, one server fn, one Effect program. The page type is inferred end to end, and nobody writes a props interface.

```tsx
// src/routes/juegos/$juegoId.tsx
export const Route = createFileRoute('/juegos/$juegoId')({
  loader: ({ params }) => fichaJuegoFn({ data: { juegoId: params.juegoId } }),
  component: Ficha,
})
function Ficha() {
  const { juego, resumen, personal, perfiles, pendientes } = Route.useLoaderData()   // fully typed
  return (<>
    <EstadoJuego resumen={resumen} pendientes={pendientes.length} />                  {/* variant 1 badge */}
    {personal?.en_mi_distribucion && <p>En tu distribución: {estadoCompatibilidad[personal.en_mi_distribucion.estado].texto}</p>}
    {resumen.entornos.map((e) => <FilaEntorno key={e.clave} entorno={e} />)}          {/* matrix */}
  </>)
}

// src/fns/catalogo.ts: the whole server boundary for this page
export const fichaJuegoFn = createServerFn({ method: 'GET' })
  .validator(Schema.toStandardSchemaV1(Schema.Struct({ juegoId: IdDesdeTexto(JuegoId) })))
  .handler(({ data }) => leer(fichaJuego(data.juegoId)))

// src/servidor/consultas/ficha.ts: rows decoded by the domain Schema, summary by the pure rule
const pruebas = yield* SqlSchema.findAll({ Request: JuegoId, Result: PruebaAprobada, execute: (id) => sql`...` })(juegoId)
const resumen = resumir(pruebas)                       // PruebaAprobada has estado_revision: Literal('aprobado')
return { juego, ediciones, resumen, personal, perfiles, causas, aprobados, pendientes }
```

A missing game makes the program fail with `NoEncontrado`. `leer` turns that into `throw notFound()`, and the root `notFoundComponent` renders it, on SSR and on client navigation alike.

**A report breaks a rule, and the field shows the error.**

```tsx
// src/routes/juegos/$juegoId.reportar.tsx
const r = useAccion(NuevoReporte, registrarReporteFn, {
  alFallar: erroresDeRegla,                   // fallo: { _tag: 'ReglaIncumplida'; regla: Regla }, the only failure registrarReporte returns
  alCompletar: () => navigate({ to: '/juegos/$juegoId', params: { juegoId } }),
})
<form action={r.enviar}>
  <select name="perfil_id">…</select>
  <ErrorCampo errores={r.errores} campo="perfil_id" />   {/* "El perfil es para otra distribución que la de tu diagnóstico." */}
  <button disabled={r.enviando}>Enviar reporte</button>
</form>
```

`useAccion` checks the input in two places. First, the browser decodes the FormData with `NuevoReporte`, so a blank observation or a failing result without a fallo shows its field error before any request. If that passes, the server fn validates the same Encoded value with the same schema. The program then fails with `ReglaIncumplida({ regla: 'perfil_otra_distribucion' })` from `discrepancias`, and `accion` returns `{ ok: false, fallo: { _tag: 'ReglaIncumplida', regla: 'perfil_otra_distribucion' } }`. The `reglas` table (`dominio/fallos.ts`) maps each rule to `{ campo, mensaje }`.

**A reviewer approves.**

```tsx
// src/routes/revision.tsx: blockers come from the same function decidir runs
const r = useAccion(Schema.Struct({ ref: AporteRef, decision: Decision }), decidirFn, {
  alFallar: (f) => {                                  // exhaustive: delete a case and tsc fails (verified)
    switch (f._tag) {
      case 'ReglaIncumplida':     return { decision: reglas[f.regla].mensaje }
      case 'AprobacionBloqueada': return { decision: f.bloqueos.map((b) => bloqueo[b]).join(' ') }
    }
  },
  alCompletar: () => router.invalidate(),
})
// <button name="decision[_tag]" value="Aprobar"> with decision[motivo], decision[evidencia]
// Decision's 'Aprobar' member requires a non-blank evidencia: "approve without evidence" has no encoding.

// src/fns/revision.ts
export const decidirFn = createServerFn({ method: 'POST' })
  .validator(Schema.toStandardSchemaV1(Schema.Struct({ ref: AporteRef, decision: Decision })))
  .handler(({ data }) => accion(Schema.Union([ReglaIncumplida, AprobacionBloqueada]), decidir(data.ref, data.decision)))
```

`decidir` requires a `Revisor`, a branded `Usuario` that only `exigirRevisor` can mint. It locks the row, rejects self-review, and runs `planificar(estado, decision)`. The result `sin_cambios` makes a double click a no-op. It checks `bloqueosAprobacion` and writes the five columns. All of this happens inside the one transaction `accion` opens.

**The pure core, as its tests call it.**

```ts
estadoDe(['funciona', 'no_inicia'])                    // 'resultados_variables'
estadoDe([])                                           // 'sin_evidencia'
evaluar(capacidades(diag), condiciones(perfil))        // { veredicto: 'informacion_insuficiente', comprobaciones, solo_orientativa }
planificar('aprobado', { _tag: 'Aprobar', ... })       // 'sin_cambios'
discrepancias(prueba, perfil)                          // ['perfil_otra_distribucion']
```

## Shape

**Four directories and one dependency direction.** The direction runs `routes`/`ui` → `fns` → `servidor` → `dominio`, and `routes`/`ui` → `dominio` directly. `src/fronteras.test.ts` enforces it (MODULES.md).

- `dominio/` is pure and isomorphic, importing only `effect`. It holds Schemas and pure functions: the result-set rule, the summary, the evaluation, the state machine, comparability, input schemas and failure classes. The browser imports it too.
- `servidor/` holds the Effect programs: read models (`consultas/`), the two single writers (`aportes/aportes.ts`, `aportes/revision.ts`), auth, the migrations, the one payload parser, and `ejecutar.ts`.
- `fns/` is the network boundary. It holds only `createServerFn` exports, each one a validator plus a handler that calls `leer(...)` or `accion(...)`. This layer is forced by gotcha 3, and the test keeps it that way: a top-level line that is not an import or a `createServerFn` export fails the build with the fix in the message.
- `routes/` and `ui/` are plain React. No Effect runtime runs in the browser. Only `Schema` ships there, for forms and search params, at about 29 kB gzip as measured.

A request crosses three files: route → `fns/x.ts` → `servidor/.../program.ts`, plus pure `dominio` calls. `ejecutar.ts` is infrastructure every handler shares, not a per-request layer.

**Start-native boundary, with two runners.** `servidor/ejecutar.ts` exports exactly two functions. Both resolve the better-auth session once into the per-request `Visitante` service (`Option<Usuario>`, where a deactivated account becomes `None`).

- `leer(programa): Promise<A>` is for loaders. Its type allows only `NoEncontrado | NoAutenticado | SinPermiso | SqlError | SchemaError`. The first three become the router's own `notFound()` / `redirect()`, which Start already carries over SSR and RPC. Infra errors are thrown as defects and the route's `errorComponent` renders them.
- `accion(Fallos, programa): Promise<Respuesta<A, Fallos['Encoded']>>` is for everything a UI event triggers: every write, plus the guest's hardware evaluation. It runs the program in **one transaction**. A program whose error channel holds a domain failure missing from `Fallos` does not compile (verified by deleting `AprobacionBloqueada` from `decidirFn`).

**Domain-error transport: returned typed union, not a serialization adapter.** The evidence:

1. With an adapter, a server fn still returns `Promise<A>` and the rejection is `unknown`. The compiler cannot make the report form handle `ReglaIncumplida`. With `Respuesta`, `r.valor` cannot be read without narrowing `r.ok`, and `alFallar`'s switch is exhaustive over the exact tags the program can produce. I verified both failure directions with `tsc`.
2. An adapter is a global registry: one `createSerializationAdapter` per class, about 7 lines each, a dev-server restart on change (gotcha 9), and `instanceof` across bundles. A union member is just `Schema.encodeSync(Fallos)(e)`, a plain `{ _tag, ... }` that seroval carries (Q3 variant B, observed).
3. In-process SSR hides a missing adapter (gotcha 4), so that bug only shows in the browser. A returned value behaves the same on every path.
4. Control flow (not found, login, forbidden) uses the router's native throwables, and those already work.

Structural input errors never travel at all. The browser decodes the form with the same schema the validator uses, so the validator's JSON-in-`Error.message` failure (gotcha 6) only reaches a tampered client.

**One Schema source of truth, end to end.** Each `dominio` Schema plays every role:

- The DB `CHECK (col IN …)` lists come from `Literals.literals` in `migraciones.ts`.
- Row decoding uses `SqlSchema.findAll({ Result })`.
- The browser form decode uses `Schema.fromFormData(Schema.toCodecStringTree(S))`.
- The server fn validator uses `Schema.toStandardSchemaV1(S)`.
- The route search params use `validateSearch: toStandardSchemaV1(FiltroCatalogo)`.
- Page data is not a Schema. It is the program's inferred success type, which flows through `createServerFn` into `useLoaderData()`.

The only lists the compiler cannot derive are the `Record<Union, …>` tables (`reglas`, `vocabulario`, `exigeFallo`, `tablas`), and `satisfies Record<…>` fails the build on any gap. Constraint names mapped back to rules (`restricciones.ts`) get a DB test that asserts each name exists.

**Data decisions the stack forced:**

- **Ids are `integer GENERATED ALWAYS AS IDENTITY`**, branded `Schema.Int`. They decode as numbers, so URLs, React keys and JSON never meet `bigint`. The doc says "Entero", and 2^31 rows is plenty.
- **`numeric(7,2)` FPS decodes through `FiniteFromString`**, and U0 confirms the driver type.
- **Column names stay snake_case Spanish from the DB through TS to JSX** (`estado_revision`, `ultima_prueba`). No rename layer exists to drift.

**Rules have one home each.** The index sits in the header of `servidor/esquema/migraciones.ts`. Row-local rules are DB CHECKs, keys and three triggers. Every trigger now raises `USING ERRCODE='check_violation', CONSTRAINT='og_*'`, so `conReglasDeBd` can map it (Q5). Cross-row rules live in the two single writers. Comparability is one pure function, `discrepancias`, called at save, at approval, and by the report form's loader to offer only comparable profiles. The failing-result rule is a filter on `NuevoReporte`, so the browser shows it before any request.

**Auth: the literal `usuario` table.** Round 1 kept Laravel's `users` because renaming meant forking the starter kit. That reason is gone. better-auth's `modelName: 'usuario'` plus `fields` maps the doc's names (alias and correo were observed in the spike; the timestamp fields are a U0 probe), and `rol`/`activo` are `additionalFields` with `input: false`, so sign-up cannot set them. Two recorded deviations go in a `COMMENT ON`: `id` is text, and `contrasena_hash` lives in `account.password`. Roles are enforced by type. `exigirUsuario` yields a `Usuario`. `exigirRevisor` yields a `Revisor` brand, and `decidir` cannot run without one. Promotion happens only through `pnpm rol`. Route `beforeLoad` guards are UX only.

**Migrations and seeds.** The Effect `PgMigrator` owns every table. `1_auth` is better-auth's own `compileMigrations()` output, pasted verbatim. A DB test asserts that `getMigrations(auth.options)` then has nothing left to create, so the config and the SQL cannot drift. The seed writes approvals only through `decidir` (the fronteras test forbids any other write of `estado_revision`), so it replays the 8.10 walkthrough and proves the rules admit the demo.

**Detector handoff.** `GET /opengame-detect.sh` is a Start server route. It serves the script (Vite `?raw`) with `__OPENGAME_URL__` replaced by the request origin, so `--open` lands on whichever host served it: dev, preview, or the defense laptop. `/diagnostico/importar` is `ssr: false`. It reads `#d=`, strips it with `replaceState`, keeps the raw string in `sessionStorage`, and posts it untouched to `evaluarDiagnosticoFn` through `accion(PayloadInvalido, …)`. Guests get the evaluation and nothing is stored. "Guardar en mi equipo" requires login and is idempotent on `UNIQUE (equipo_id, capturado_en)`. The parser lives under `servidor/`, so the browser cannot import it.

**Where Effect pays, and where it doesn't.** It pays on the server:

- typed error channels that decide what reaches the UI
- `Visitante` as a per-request service
- one `ManagedRuntime` holding the pool, plus HMR dispose
- `withTransaction` per action
- Schema at every boundary
- `@effect/vitest` for programs against a real DB

It is ceremony elsewhere, so it is absent there: React components and hooks, better-auth (left as is), the detector, pure functions (plain TS, no `Effect` return types). The only Effect type that crosses into the browser is `Schema`.

**What it deliberately does not do.** It never stores a verdict or an FPS estimate. It never executes or downloads a stored command. It has no HttpApi or OpenAPI, no serialization adapters, no client-side Effect runtime, no admin UI, and no profile or guide authoring UI (round 1 cuts stand).

## Synthesis decision

See `ARCHITECTURE.md`, section Synthesis. The grafts listed there amend this rationale and the sketch; implementation follows the grafts where they differ.

## Tradeoffs accepted

- We accept a `fns/` directory of one-line server fns in exchange for a boundary the test can police. The Start compiler would also let handlers live in route files, but then "never import servidor from UI" could not be checked by path.
- We accept writing each action's failure schema at the call (`accion(ReglaIncumplida, …)`) in exchange for a compiler check that it matches the program. This is the spike's variant B made generic.
- We accept about 29 kB gzip of Effect Schema in the browser in exchange for the same schema producing field errors client-side, with no second validator.
- We accept a transaction around every action, including the read-only guest evaluation, in exchange for writes that never remember to open one.
- We accept the composite FK `reporte_perfil_fk` as a backstop of `discrepancias` (same `Regla`, never the one that fires in-app), because it is a round 1 fixed decision and costs nothing.
- We accept text `usuario.id` and the password hash in `account` as documented deviations in exchange for not owning auth code.
- We accept that an old migration's `CHECK (… IN …)` reads today's literal list on a fresh DB (as in round 1). A new literal means a new migration.
- We accept the `/diagnostico/importar` page rendering client-only (`ssr: false`), because the fragment exists only in the browser.

## Alternatives considered

- **HttpApi as the single contract** (spike Q8: it works, typed errors arrive as real classes, and it produces OpenAPI). It exposes more to callers: a client layer per call site (about 8 lines), SSR loaders calling the handler in-process (not tried), and a second routing system beside Start's. It hides nothing we need, because OpenAPI has no consumer here. It lost on reader load and deadline, though it is the best answer if a second client ever appears.
- **A serialization-adapter registry for thrown errors.** It keeps `throw` semantics but makes failures invisible to the type system at the call site, and it needs a restart-sensitive global registry. It lost on rubric item 3: the compiler would not check that the UI handles failures.
- **Server fns inline in route files**, with no `fns/` directory. That means one fewer file per request, but a leak becomes a hydration crash instead of a test failure. It lost on enforceability.
- **Keeping a `users` table plus `COMMENT ON` mapping** (round 1). Its only justification was the Laravel kit, which no longer exists.
- **`bigserial` ids** (spike default). They cause bigint friction in every URL, key and log line for capacity we will never use.

## Implementation reconciliation

Once a unit lands, its code is authoritative and the sketch is history. The rule-home index lives in the header of `src/servidor/esquema/migraciones.ts`.

| Unit | Deviation | Accepted because | Source |
|---|---|---|---|
| U0 | App at the repo root, `routeTree.gen.ts` gitignored, `docs/architecture/probes.md` | One app; the tree is regenerated by `pnpm check` | Synthesis amendment, U0 report |
| U0 | Nullable form fields send `"null"`; `NuevoReporte.fallos` defaults to `[]` | Probe (a) observed `fromFormData` semantics | `probes.md` |
| U1 | A profile freezes once reviewed or used by a report, not from creation | Section 8.5 and 8.9 say so; the doc wins over the sketch | U1 report, owner default (doc is the spec) |
| U1 | An equipo's owner can change until its first diagnosis exists (trigger `og_propietario_fijo`) | Section 8.3 "no transferible si ya hay pruebas" | U1 report |
| U1 | Partial index `reporte_aprobados_por_edicion` dropped | The doc's index on `reporte(edicion_id, estado_revision, fecha_prueba)` covers the same queries | U1 report |
| U1 + U2 | `reporte_perfil_fk` is not mapped to a `Regla` | `discrepancias` rejects first with `PerfilNoComparable`; a hit is a writer bug and stays an infra error | Integration fix `762ca1b` |
| U2 | `NuevoReporte` is one flat member per `Resultado`, no nested `ResultadoObservado` | Keeps the form error path at `["fallos"]`; a union picks its member only on a single literal | U2 report |
| U2 | `planificar` returns `'transicion_invalida'`; `decidir` builds `TransicionInvalida` | Avoids an import cycle between `fallos.ts` and `revision.ts` | U2 report |
| U2c | Route file `src/routes/[_]muestras.tsx` | `_muestras.tsx` is a pathless layout to the router generator | U2c report |


## Open questions and risks

1. Does `Schema.fromFormData(Schema.toCodecStringTree(S))` decode the report form's nested shape (`fallos[0][tipo_fallo_id]`, the `version_capa[_tag]` union, a null `perfil_id`) at runtime? It typechecks. If not, U0 falls back to a controlled form object decoded with plain `Schema.decodeUnknownResult(S)`, and the hook signature stays the same.
2. Does better-auth 1.7.7 accept `fields` mappings for `createdAt`, `updatedAt` and `emailVerified`, plus `additionalFields`, and create those columns? The spike verified only name and email. The fallback is better-auth's camelCase for those three columns, recorded with `COMMENT ON`.
3. Does `@effect/sql-pg`'s native driver return `numeric` as a string and `text[]` as an array? A 10-line probe in U0 settles it, and the fix is a one-word Schema swap.
4. Will the panel accept `usuario.id` as text, and the hash living in `account`? The alternative, `generateId: 'serial'` (unverified on 1.7.7), would make `id` an integer.
5. Native Linux games: we default to `familia = 'Nativo'`, carried from round 1 open decision 2. Is that acceptable?
6. Strict "Resultados variables" (funciona + funciona_con_ajustes shows purple), carried from round 1 open decision 5. Keep it?
7. Defense hosting: `vite preview` on a team laptop (spike: it serves SSR, RPC and auth) versus a Nitro deployment. This plan assumes the laptop.

## Next implementation step

U0: scaffold with the spike's exact command and pins, drop in `sketch/src/dominio` and `fronteras.test.ts`, and run the three 2-hour-capped probes (form decode, auth field mapping, driver types). That ends with `pnpm check` green.

## Evidence (run while sketching, in /tmp/arena2-opus against the spike's node_modules; nothing installed in the repo)

- `tsr generate && tsc -p .` gives 0 errors over all of `sketch/src`, `tests`, `scripts`, with strict, `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`.
- Negative type checks:
  - Removing `AprobacionBloqueada` from `decidirFn`'s failure schema fails with "AprobacionBloqueada is not assignable to ReglaIncumplida | Control | Infra".
  - Removing its `case` from the review page fails with TS2366.
  - Removing `resultados_variables` from `vocabulario.ts` fails at every use.
- `vite build` passes. `dist/client` has no match for better-auth server code, `PgClient`, `withTransaction`, `getSession` or the SQL. The Effect Schema chunk is 29.2 kB gzip, against 98 kB for React + router.
- `vitest run src` passes `fronteras.test.ts` (7 tests) and `estadoDe`. Three planted violations each failed the matching test with its fix message: a module-scope `const` in `fns/`, a route importing `servidor/auth.ts`, and an `UPDATE … SET estado_revision` in `aportes.ts`.
