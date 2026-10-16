# Module map

## Dependency direction, and how the build enforces it

```
routes/ ─┬─► fns/ ──► server/ ──► domain/ ──► effect
ui/ ─────┴──────────────────────────► domain/
```

| Layer | May import | Enforced by |
|---|---|---|
| `src/domain/` | `effect`, `domain/` | `src/boundaries.test.ts` |
| `src/server/` | `effect`, `@effect/*`, `better-auth`, `pg`, `@tanstack/react-start/server`, `@tanstack/react-router` (only for `notFound`/`redirect` in `run.ts`), `domain/`, `server/` | same |
| `src/fns/` | `@tanstack/react-start`, `effect`, `domain/`, `server/` | same, plus the rule that **a top-level line is only an import or `export const x = createServerFn(`** (gotcha 3) |
| `src/routes/` | `@tanstack/*`, `react`, `effect`, `domain/`, `fns/`, `ui/`, `routes/` (helpers in `-*.ts` files the router skips), `detector/`, `assets/`, `better-auth/react` | same. Three allowlisted exceptions, server handlers with no component: `routes/api/auth/$.ts`, `routes/opengame-detect[.]sh.ts` and `routes/opengame-detect[.]ps1.ts` |
| `src/ui/` | `react`, `effect`, `@tanstack/react-router`, `domain/`, `ui/` | same |
| review block writes | only `server/commands/review.ts` (and DDL in `server/schema/`) | same test: an SQL template with `SET`/`INSERT INTO` that touches `review_status`, `revisor_id` or `evidencia_revision` anywhere else, `scripts/` included, fails |
| equipo/diagnostico writes | only `server/commands/diagnostic.ts` | `src/boundaries.test.ts`, same scan of `src/` and `scripts/` |
| protondb_summary writes | only `server/external/protondb.ts` | `src/boundaries.test.ts`, same scan of `src/` and `scripts/` |
| upstream_fix writes | only `server/commands/upstream.ts` | `src/boundaries.test.ts`, same scan of `src/` and `scripts/` |
| browser bundle | no server code, no GPU table, no detector script | `scripts/no-server-in-client.ts` after `vite build`, inside `pnpm check` (markers include `OPENGAME_TABLA_GPU` and `Win32_VideoController`) |
| `styles.css` | every rule closed (no accidental nesting), one rule per selector | `src/styles.test.ts` |

Each failure message names the fix, for example: "routes call server fns from src/fns/; never import src/server/ (it would ship pg to the browser)". All three planted violations failed as intended (RATIONALE, Evidence).

## Ownership

| Path | Owns | Does not own |
|---|---|---|
| `domain/ids.ts` | Branded integer ids (including `DependencyId`), text `UserId`, `RequiredText` (trim + non-empty), `OptionalText` (blank → null), `routeIdParser` (`routes/-ids.ts`) | |
| `domain/literals.ts` | `LayerFamily`, `Outcome` with `WorkingOutcome`/`FailingOutcome`, `requiresFailure`, `ProtonVariant`. Imports only `effect`, so `contributions.ts` can spread `tables.ts` fields without a cycle | |
| `domain/compatibility.ts` | `CompatibilityStatus`, `estadoDeResultado` (explicit map), **`statusOf`** (the only result-set rule), `ApprovedTest` (row schema that proves approval), **`summarize(pruebas, ahora)`** (the one state function for ficha and catalog: last-year base set, `sin_confirmacion_reciente`, `regresiones`), `onDistribution` | Queries, the clock |
| `domain/recency.ts` | **`isRecent`**, the only 365-day window, for OpenGame's reports (against `ahora`) and ProtonDB's (against the export date) | |
| `domain/protondb.ts` | The export's boundary Schema (private), `parseReport`, `summarizeProtonDb` (the stored aggregate, deduplicated) | OpenGame's state: nothing here reaches `summarize` |
| `domain/evaluation.ts` | `OperatingSystem`, `VulkanSupport`, `MachineVulkan` (tagged by `soporte`; `si` and `no` carry their `origen`, `medido` or `proyectado`, and `si` a `VulkanRange`, one point when measured), `vulkanVersion`/`atLeast`, `vulkanRangeText`, `Capabilities`, `KnownRequirements`, **`evaluate`** (3 outcomes, no FPS field; a projected range that straddles the minimum is `desconocido`), the `requirements` column adapter, `suggestProfile` | Building `Capabilities` from columns (`server/gpu/capability.ts`) |
| `domain/gpu.ts` | `PciId`, `GpuFamily` (15 families), `LinuxDriver`, `D3dPath`, `GpuWarning`, and the `MachineOnLinux` type the GPU card reads. Literals and types only, so it ships to the browser small | The id table, the policy per family |
| `domain/graphics-path.ts` | `RENDER_PATHS` (the one best-first order of graphics paths), **`gamePath`** (a game's declared APIs and minimum x86-64 level against `MachineOnLinux`: `con_ruta`, `sin_ruta`, `sin_datos` with the certain floor, `sin_apis`). Composes `machineOnLinux`'s path and `vulkanStatus`; never recomputes a Vulkan threshold | Vulkan levels per path (`server/gpu/capability.ts`) |
| `domain/distros.ts` | `DISTROS` (sourced facts only, display order), `REGLAS` (one per objection code, each marking whether it rules the distro out), **`screenDistros`** | Any ranking |
| `domain/max-lengths.ts` | `maxLengths`, every column length limit by table, plus `biblioteca.nombre` for library game names. Imports nothing, so `tables.ts` and `library.ts` share it without a cycle | |
| `domain/library.ts` | `STEAM_LAUNCHER`, `MAX_LIBRARY_GAMES` (1000), `SteamAppId`, `LibraryGame`, `SteamLibrary`, `EvaluatedLibrary`, `isSteamTool` | |
| `domain/review.ts` | `ReviewStatus`, **`nextStatuses`** (the only transition table), `Decision` (approval requires evidence), `planTransition` (idempotence), `ContributionRef`, `Blocker`, `Role`, `canReview` | Who may decide, preconditions |
| `domain/contributions.ts` | Every input schema (`NewReport` with the failing-result filter, `NewSolution`, `NewGame`, `Capture` with `gpu_pci_id` and `biblioteca_steam` and the Linux driver and Vulkan only on its Linux member, `ManualCapture` without the PCI id or library, `DiagnosticInput` with detector text capped at 300 000 characters (derived from `MAX_LIBRARY_GAMES` and `maxLengths.biblioteca.nombre`), `SaveDiagnostic` with `con_biblioteca`, `LayerVersionRef`, `TargetMachine`, `CatalogFilter`), **`mismatches`** (8.7 comparability) | Persisting |
| `domain/errors.ts` | `Rule` + `rules` (field + Spanish message per rule), failure classes, `DomainError`, `Reply`, control errors | |
| `domain/guides.ts` | `GuideType`, `GuideStatus` | |
| `domain/upstream.ts` | `SteamAppId`, `ProtonfixesPr`, `FixNote`, **`exportFix`** (profile → umu-protonfixes file, every untranslated token listed) and **`protonReport`** (report → Valve's compatibility-report). The tokenizer, the brand-gated Python renderer and the GitHub URL builders are private | Sending anything: users open the prefilled links themselves |
| `server/runtime.ts` | `PgLive` (config `DATABASE_URL`), the one `ManagedRuntime`, HMR dispose | |
| `server/auth.ts` | better-auth instance (usuario mapping, `rol`/`activo` additionalFields, public sign-up refuses `demoDomain`), `Visitor` service, `visitorOf`, `requireUser`, `requireReviewer` → `Reviewer` brand | Data rules |
| `server/run.ts` | `runRead`, `runAction`: session → `Visitor`, transaction per action, control errors → `notFound`/`redirect`, domain failures → `Reply` | Business rules |
| `server/schema/migrations.ts` | All DDL, the rule-home index, and CHECK lists generated from Schema literals | |
| `server/schema/constraints.ts` | `ruleByConstraint` (constraint name → `Rule`), `withDbRules` | |
| `server/commands/contributions.ts` | **Single writer** of report/report_failure/layer_version upsert, solution, and game/game_edition (`createGame`, reviewers only). App-side 8.7/8.9 write rules | The review block, equipo/diagnostico |
| `server/commands/diagnostic.ts` | **Single writer** of equipo and diagnostico, and the distribucion a capture names (`submitDiagnostic`, converging on one equipo per alias and one capture per time). Stores `biblioteca_steam` only when `con_biblioteca` is true | |
| `server/commands/review.ts` | **Single writer** of the review block. `decide`, `approvalBlockers`, the reviewable-table registry | |
| `server/commands/upstream.ts` | **Single writer** of upstream_fix (`noteFix`, reviewers only): merged umu-protonfixes PRs of approved, exportable, non-demo profiles | |
| `server/external/protondb.ts` | **Single writer** of `protondb_summary`. `arrayElements` (streams the export's top-level array), `importProtonDb` (read all, then replace in one transaction; refuses an older export), `importSummary` | Catalog rows: it only matches existing Steam editions |
| `server/queries/*.ts` | Read models: `catalog`, `profile`, `guides`, `guide`, `reportOptions`, `solutionOptions`, `gameOptions`, `gamePage`, `queue`, `evaluateWithoutSaving`, `myDiagnostic`, `myMachines`, `protonDbSummaries` (ficha and catalog), `myProtonReport`. Their success types are the page types. `gamePage` and `catalog` read `ahora` once from the `Clock` | Writes |
| `server/diagnostics/payload.ts` | **The only detector parser**: `parsePayload` over payload v1, a union on `sistema` (the Windows member has no Vulkan and no kernel driver). It normalizes `gpu_pci_id` (a malformed id becomes null), the library (drops Steam tools and bad app ids, keeps the first of each id in the detector's order, cuts at 1000) and `rolling`. The private `etiquetaPci` names a GPU the detector could not name | |
| `server/gpu/capability.ts` | **`machineOnLinux`**, the only builder of what `evaluate` consumes: PCI id to family, the policy per family (Linux driver, Vulkan range, warnings), the Direct3D path. Measured Linux Vulkan wins over the projection, and a Windows row's stored Vulkan is never read | Storing anything |
| `server/gpu/families.generated.ts` | The PCI id to `GpuFamily` table, generated by `pnpm gpu:generar` with its source pins in the header. Never edited by hand | |
| `server/gpu/ranges.ts` | `encodeSpans`/`decodeSpans`, the hex-run format of that table, shared by the generator and `capability.ts` | |
| `fns/*.ts` | The server API surface: one `createServerFn` per operation | Anything else |
| `routes/**` | Pages, loaders, search params, route guards (UX only) | Data rules |
| `ui/useAction.ts` | The one form hook: the form's props (`method="post"` included), decode FormData → call fn → narrow `Reply` → field errors | |
| `routes/-return-to.ts` | `Destination` and the only parser of `?volver=` on `/entrar` and `/registro`; `returnHere` for route guards | |
| `ui/format.ts` | Display formatting. Every instant prints in Bogotá time with the year (`date` day, `dateTime` day and 24-hour time) | |
| `ui/progress.ts` | The profile page's local step checklist (`localStorage`, SSR-safe) | |
| `ui/vocabulary.ts` | Spanish label and tone for every domain literal, exhaustive via `satisfies Record` | |
| `ui/diagnostics/GraphicsCardOnLinux.tsx` | The "Tu tarjeta gráfica en Linux" card: family, Linux driver, Vulkan labelled "Detectado" or "Proyectado", the Direct3D path with its launch option, and the warnings | |
| `ui/diagnostics/MachineGames.tsx` | The diagnosis matrix, split into "Tu biblioteca de Steam", "Juegos que todavía no conocemos" and "Resto del catálogo" when the capture has a library | |
| `ui/compatibility/*` | `GameStatus` (variant 1 badge, the stale note and "Dejó de funcionar"), `EnvironmentMatrix`, `VerdictForMe` (with the "En tu distribución" line), `GraphicsPath` (the hardware-only path, apart from the community state and the profile check), evaluation checklist, copy box | |
| `ui/protondb/ProtonDb.tsx` | The ficha's "Otras fuentes: ProtonDB" section, the catalog card line, the ODbL attribution | |
| `ui/diagnostics/Distributions.tsx` | The "Distribuciones" section: candidates grouped by verdict with their reasons | |
| `detector/opengame-detect.sh` | The productionized prototype script: payload v1 + `gpu_pci_id` + `biblioteca_steam`, with `__OPENGAME_URL__` and `__OPENGAME_MAX_JUEGOS__` filled in by the server route | |
| `detector/opengame-detect.ps1` | The Windows detector for Windows PowerShell 5.1 and pwsh 7, ASCII only, no admin: the same payload without Vulkan or kernel driver. A URL over 2000 characters (the ShellExecute limit) goes to the clipboard and opens `/diagnostico?pegar=1` | |
| `scripts/` | `migrate`, `sembrar` (approvals only via `decide`), `rol`, `protondb` (`pnpm db:protondb <ruta \| ->`), `sin-servidor-en-cliente`, `generar-gpus` (`pnpm gpu:generar`) with its pure parsers in `gpu-sources.ts`, which fail closed on an unreadable line, an unknown token or a count under its floor | |
| `tests/` | `support.ts` (rollback-per-test, constraint-name decoder), `setup.ts` (globalSetup: refuses any DB not named `*_test`, rebuilds the schema, migrates), `schema.test.ts`, `contributions.test.ts` | |

## Route map

| Wireframe / RF | Path | Loader / action fns | Auth |
|---|---|---|---|
| 9.1 Inicio + buscador (RF-01, 02) | `/` `?q&estado&lanzador&sin_anti_cheat` | `catalogFn` | public |
| 9.3 Ficha (RF-02, 03, 06, 08, 10) | `/juegos/$gameId` | `gamePageFn` | public; personal verdict when logged in with a diagnosis |
| 9.4 Asistente → profile page (RF-06, 07) | `/perfiles/$profileId` | `profileFn`; reviewers record merged PRs with `noteFixFn` | public (pending shows "en prueba") |
| RF-08 report | `/juegos/$gameId/reportar?profile=` | `reportOptionsFn` / `submitReportFn` | login |
| RF-08 solution | `/reportes/$reportId/solucion?tipoFallo=` | `submitSolutionFn` | login |
| 9.2 Diagnóstico (RF-04, 05, 09) | `/diagnostico` `?pegar=1` | `myMachinesFn` / `evaluateDiagnosticFn`, `saveDiagnosticFn` | public evaluation; saving needs login |
| detector landing | `/diagnostico/importar#d=…` (`ssr: false`) | `evaluateDiagnosticFn` | public |
| saved diagnosis | `/diagnosticos/$diagnosticId` | `myDiagnosticFn` | owner only (others get notFound) |
| Proton report for Valve | `/reportes/$reportId/proton` | `protonReportFn` | report owner only (others get notFound) |
| RF-09 guides | `/guides`, `/guides/$guideId` | `guidesFn`, `guideFn` | public |
| RF-10 review | `/revision?tipo=profile\|reporte\|solucion` | `queueFn` / `decideFn` | revisor, administrador |
| RF-03 new game | `/catalog/nuevo` | `createGameFn` | revisor, administrador |
| auth | `/entrar`, `/registro`; server route `/api/auth/$` | better-auth client | |
| detector scripts | server routes `/opengame-detect.sh`, `/opengame-detect.ps1` | | public |

## Rule homes

Every 8.7, 8.9 and 8.11 rule has exactly one home. Constraint and trigger names are in `src/server/schema/migrations.ts`.

| Rule | Home |
|---|---|
| PK, FK, UQ, composite keys, no duplicate dependencia / fallo | DB keys |
| enumerated domains, magnitudes, ranges | DB CHECK (lists from domain Schemas) |
| blank strings | DB CHECK *_no_vacio (+ Texto on input) |
| review block shape per state, approval needs evidence, valid review_status | DB CHECK *_review_block |
| revisado_en >= creado_en | DB CHECK *_revision_posterior |
| fps => resolucion, calidad, metodo | DB CHECK reporte_fps_con_contexto |
| Linux capture <=> distribucion_id; vulkan version only if si | DB CHECK |
| gpu_pci_id is lowercase `vvvv:dddd`; the library is a JSON array of at most 1000 | DB CHECK diagnostico_gpu_pci_id_formato, diagnostico_biblioteca_steam_forma (+ PciId, BibliotecaSteam on input) |
| capture immutable | DB trigger og_immutable |
| equipo owner fixed once it has a capture | DB trigger og_propietario_fijo |
| report / solution content never rewritten (frozen at birth) | DB trigger og_review_only |
| profile, its steps and deps frozen once reviewed or used | DB trigger og_perfil_congelado |
| solution -> report_failure | DB composite FK solution_failure_fk |
| report comparability (edition, layer, distro, arch, version) (edition + layer also a composite FK backstop, unmapped) | app: domain/contributions.ts discrepancias (+ DB reporte_perfil_fk) |
| own equipo; Linux diagnosis; fecha_prueba >= capturado_en | app: server/commands/contributions.ts |
| solution's profile in the report's edition | app: server/commands/contributions.ts |
| one equipo per alias per user, one capture per time; the library stored only by the user's choice | app: server/commands/diagnostic.ts |
| measured Linux Vulkan beats the projection; Windows Vulkan is never evaluated | app: server/gpu/capability.ts machineOnLinux |
| failing result has >= 1 fallo | app: domain/contributions.ts NuevoReporte |
| reviewer role + activo (also: only reviewers register games) | app: server/auth.ts requireReviewer |
| author != reviewer (all three tables), transitions, approval preconditions | app: server/commands/review.ts decide |
| only reviewers publish guides | no write path this delivery (seeded) |
| one profile per merged PR; only approved, exportable, non-demo profiles | DB UQ upstream_fix_pr_uq + app: server/commands/upstream.ts |
| upstream_fix rows never rewritten (Anular deletes) | DB trigger og_immutable |
| public view hides retired rows | app: server/queries (WHERE aprobado) |
| state from the approved reports of the last 365 days, else all of them flagged | app: domain/compatibility.ts resumir + domain/recency.ts |
| ProtonDB never feeds the computed state; aggregates only (8.9) | app: no path from domain/protondb.ts to resumir; DB: protondb_summary has no report rows |
| ProtonDB row counts nest, a layer only with its count | DB CHECK protondb_summary_nested_counts, _layer_with_reports, _version_with_variant |

Single writers. `src/boundaries.test.ts` checks the SQL in `src/` and `scripts/` for the first two and the last two.

| Tables | Writer |
|---|---|
| `equipo`, `diagnostico` (and the `distribucion` a capture names) | `server/commands/diagnostic.ts` |
| review block of `profile`, `report`, `solution` | `server/commands/review.ts` `decide` |
| `report` (with `report_failure` and the `layer_version` upsert), `solution`, `game` (with `game_edition`) | `server/commands/contributions.ts` |
| `protondb_summary` | `server/external/protondb.ts` `importProtonDb` |
| `upstream_fix` | `server/commands/upstream.ts` `noteFix` |
