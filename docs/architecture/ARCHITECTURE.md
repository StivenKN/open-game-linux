# OpenGame Linux web app: architecture

Status: approved by the owner on 2026-10-10 ("after this stack decision, implement it"). The five open decisions take their defaults, listed at the end.

This folder is the contract the implementation fills in.

- `RATIONALE.md` covers the problem, caller usage, shape, tradeoffs and alternatives.
- `MODULES.md` says which directory owns which rule, and how a test enforces the direction.
- `PLAN.md` holds the build units, the lanes and the cuts.
- `sketch/` holds the types, Schemas, signatures, the migration and the routes, with `not implemented` bodies. It typechecks under TypeScript 7.0.2 strict and passes `vite build` against the spike's packages.

Section 8 of the project document is the spec. Where a wireframe contradicts it, section 8 wins, and `PLAN.md` lists each cut. Round 1 (Laravel) is archived in `.scratch/round1-laravel/`. Its domain decisions carry over unchanged.

## Stack

TanStack Start 1.169 on Vite 8 serves React 19 with SSR. Effect 4.0.2 runs the server side, and `@effect/sql-pg` talks to PostgreSQL 18. better-auth 1.7 owns sign-up, sign-in and sessions. TypeScript 7.0.2 strict, Vitest 5 with `@effect/vitest`, oxlint for `no-explicit-any` and no type assertions. The whole Effect family is pinned to 4.0.2 (spike gotcha 1).

## The core in five sentences

1. Route loaders and `createServerFn` are the only server boundary. Each server fn is one line that calls `runRead` (reads) or `runAction` (UI-triggered calls, one transaction each) in `server/run.ts`.
2. Domain failures come back as a returned `Reply<A, E>` union, never as thrown errors, so the compiler checks that each form handles exactly the failures its program can produce. Not found, login and forbidden use the router's own `notFound()` and `redirect()`.
3. One Effect Schema per concept serves the DB CHECK lists, row decoding, browser form decoding, server fn validation and search params. Page data types are inferred from the server programs. Only `Schema` ships to the browser, with no Effect runtime there.
4. Nothing stores a verdict or a projection. `summarize` and `statusOf` compute compatibility from approved reports on each request. `machineOnLinux` projects what the GPU can do on Linux from its stored PCI id, and `evaluate` gives exactly three outcomes with no FPS field.
5. Every 8.7/8.9/8.11 rule has one home. Row-local rules are DB constraints and three triggers. Cross-row rules live in `server/commands/contributions.ts` (single writer of contributions) and `server/commands/review.ts` (single writer of the review block). `src/boundaries.test.ts` fails the build on a second writer or a wrong import.

## Decisions settled by prototype

| Question | Evidence | Decision |
|---|---|---|
| Q1. Detector and handoff | `prototypes/detector/` | Bash script with no root. Handoff by URL fragment `#d=`, with paste as fallback. Vulkan stays `desconocido` without `vulkaninfo`. Amended in U10: a PowerShell script does the same on Windows without admin rights. Windows never reports Vulkan, because Windows Vulkan says nothing about Linux. The GPU's PCI id projects it instead (RATIONALE, U10). |
| Q1b. RAM comparison | `prototypes/detector/FINDINGS.md` | The script reports installed RAM from sysfs memory blocks. Exact comparison, no tolerance factor. |
| Q2. Verdict presentation | `prototypes/veredicto/` | Variant 1 "semáforo derivado", plus variant 2's "En tu distribución" line. |
| Q3. "Aplicar perfil" | Section 8.5 | Ordered steps with copy buttons. Nothing downloads or executes. |
| Q4. Does the stack work together? | `prototypes/stack-spike/FINDINGS.md` | Yes, with four traps designed around: pin Effect to 4.0.2, thrown errors lose their class on Start's wire, module scope in a server-fn file ships to the browser, better-auth keeps the password in `account` and opens its own pool. |

## Synthesis

Three candidates ran in parallel with assigned shapes.

| Candidate | Shape | Cross-judge (Fable) |
|---|---|---|
| Opus | Start server functions as the only boundary | 26 |
| Fable | One Effect `HttpApi` contract served inside Start | 24 |
| Sonnet | No Start: Vite SPA plus a standalone `HttpApi` server, hand-written auth | 23 |

**Base: Opus.** The judge and I picked it independently. It has the shortest request path (route, server fn, program), the only compile check that a form handles every failure its write can return, and no Effect runtime in the browser. Fable's contract buys OpenAPI and real error classes for a second client that does not exist, at the cost of a browser runtime and an in-process HTTP hop per SSR loader. Its dependency rule tool (dependency-cruiser) cruises zero modules on TypeScript 7. Sonnet argued honestly against SSR, but owning auth and two dev processes is more to carry by 10-20 than Start, which the spike already proved.

**Grafts.** These amend the sketch. Implementation follows them where the sketch differs.

| From | Graft |
|---|---|
| Fable | `domain/tables.ts`: one row Schema per table built from `RequiredText(n)`, branded ids and a spread `ReviewFields`. Queries pick from it instead of declaring ad-hoc Structs, and input Schemas spread its fields. The migration reads `varchar(n)` lengths from the same `RequiredText(n)` constants, so no drift test is needed. |
| Fable | Fixtures for app tests come from an `escenario()` helper that writes through the real writers, so a fixture cannot encode a state the app cannot reach. Route components are named functions (an inline arrow loses the loader type). |
| Fable | `InvalidTransition { de, a }` is its own failure class, not a `Rule` case. |
| Sonnet | `Capture` is a union of Linux and Windows members. `ResultadoObservado` requires a `NonEmptyArray` of fallos for a failing result, replacing the filter with a TODO. |
| Sonnet | The review CHECK is built from `formaPorEstado satisfies Record<ReviewStatus, string>`. That makes the separate `estado_revision IN (...)` CHECK redundant, so it goes. |
| Sonnet | `test/ayudas/db.ts` (savepoint-based `constraintOf`) and the `schema.test.ts` bodies that ran green on PostgreSQL 18.6 replace the sketch's `it.todo` list, renamed to the sketch's constraint names. A report's content is frozen from birth, so FPS rules are tested with INSERT. |
| Sonnet | `IncomparableProfile { mismatches: NonEmptyArray<Mismatch> }` with `{ de, esperado, observado }`, so the message can say "perfil para x86_64, tu diagnóstico es aarch64". |
| Sonnet | `.oxlintrc.json` with `no-explicit-any`, `consistent-type-assertions: never` and `no-non-null-assertion`, inside `pnpm check`. |
| Judge | Author ≠ reviewer gets one home, in `decide`, for all three reviewable tables. The `*_sin_autoaprobacion` CHECKs go, because `reporte`'s author is only reachable through a join. |
| Judge | The detector route reads the script inside its handler, not at module scope, so its text stays out of the client chunk. |

**Rejected.**

- **HttpApi as the contract.** No second client exists. It stays the escape hatch if one appears.
- **A serialization adapter registry for thrown errors.** Failures would be untyped at the call site, and SSR hides a missing adapter.
- **Hand-written auth.** It is a security surface the team would own eight days before the defense.
- **dependency-cruiser.** It does not support TypeScript 7.
- **`bigserial` ids.** They add bigint friction to every URL and React key. Ids are `integer GENERATED ALWAYS AS IDENTITY`.
- **Running `evaluate` in the browser for guests.** It is attractive, but the server already evaluates in a read-only `runAction`, so there is one path for guests and users.

**Known double homes, kept on purpose.** The FPS context rule is both the `FpsMeasurement` input type (for field errors before a request) and the CHECK `reporte_fps_con_contexto` (the enforcement). "Solo revisores publican guías" has no code home because there is no guide authoring UI. Guides come from seeders, and the defense deck says so.

## Open decisions, with the defaults the build follows

1. **`usuario`.** The doc's table name and columns are literal (`alias`, `correo`, `rol`, `activo`), owned by better-auth. Two recorded deviations go in `COMMENT ON`. The id is text, and the password hash lives in `account.password`. The alternative is a hand-written session layer with `usuario.contrasena_hash` and integer ids.
2. **Native Linux games** (CS2, ETS2). `familia` gains `Nativo` next to Wine and Proton. The alternative is to keep native titles out of the catalog.
3. **Seed data.** Demo content is marked "Datos de ejemplo". Approved reports come only from the team's own real runs, so at least one game honestly shows "Sin evidencia verificada".
4. **Wireframe screens that change shape.** The 5-step wizard becomes ficha plus profile page. The CPU/GPU dropdowns become a manual form. The Windows vs Linux RAM comparator is cut. Profiles and guides come from seeders.
5. **Strict "Resultados variables".** A mix of `funciona` and `funciona_con_ajustes` shows purple, as 8.10 says literally.

## Throughput checkpoint

- **Blocking first steps.** U0 scaffolds the app at the repo root with the spike's pins and runs three probes capped at 2 hours (form decode of nested FormData, better-auth field mapping, driver types for `numeric` and `text[]`). Nothing else starts until `pnpm check` is green on `main`.
- **Independent workstreams.** After U0, three lanes run in parallel. U1 is the schema and DB tests. U2 is the pure domain plus the payload parser. U2c is the verdict components on fixtures. After U3 (runtime, auth, seed base), U4 (read pages), U5 (writes and review) and U6 (diagnosis) run in parallel. U7 and U8 fill the gaps.
- **Shared mutable state.** `server/schema/migrations.ts` and `domain/errors.ts` have one owner (lane A). `routeTree.gen.ts` is regenerated, never merged. `ui/vocabulary.ts` is appended per lane, and `tsc` catches gaps. Each delegate works in its own git worktree on its own branch. Parallel lanes share one local Postgres container but each uses its own `*_test` database.
- **Smallest safe decomposition.** One owner per lane, three lanes. Lane A (U0, U1, U3, U5, U9) is the critical path. Splitting U5 further would put two writers on the review rules.
