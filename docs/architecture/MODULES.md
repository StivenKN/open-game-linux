# Module map

## Dependency direction, and how the build enforces it

```
routes/ ─┬─► fns/ ──► server/ ──► domain/ ──► effect
ui/ ─────┴──────────────────────────► domain/
```

| Layer | May import | Enforced by |
|---|---|---|
| `src/domain/` | `effect`, `domain/` | `src/boundaries.test.ts` |
| `src/server/` | `effect`, `@effect/*`, `better-auth`, `pg`, `node:crypto` (the catalog digest in `server/external/sources.ts`), `@tanstack/react-start/server`, `@tanstack/react-router` (only for `notFound`/`redirect` in `run.ts`), `domain/`, `server/` | same |
| `src/fns/` | `@tanstack/react-start`, `effect`, `domain/`, `server/` | same, plus the rule that **a top-level line is only an import or `export const x = createServerFn(`** (gotcha 3) |
| `src/routes/` | `@tanstack/*`, `react`, `effect`, `domain/`, `fns/`, `ui/`, `routes/` (helpers in `-*.ts` files the router skips), `detector/`, `assets/`, `better-auth/react` | same. Three allowlisted exceptions, server handlers with no component: `routes/api/auth/$.ts`, `routes/opengame-detect[.]sh.ts` and `routes/opengame-detect[.]ps1.ts` |
| `src/ui/` | `react`, `effect`, `@tanstack/react-router`, `domain/`, `ui/` | same |
| review block writes | only `server/commands/review.ts` (and DDL in `server/schema/`) | same test: an SQL template with `SET`/`INSERT INTO` that touches `review_status`, `reviewer_id` or `review_evidence` anywhere else, `scripts/` included, fails |
| machine/diagnostic writes | only `server/commands/diagnostic.ts` | `src/boundaries.test.ts`, same scan of `src/` and `scripts/` |
| protondb_summary writes | only `server/external/protondb.ts` | `src/boundaries.test.ts`, same scan of `src/` and `scripts/` |
| anticheat_entry writes | only `server/external/anticheat.ts` | `src/boundaries.test.ts`, same scan of `src/` and `scripts/` |
| external_import writes | only `server/external/sources.ts` (`recordImport`, called inside each importer's transaction) | `src/boundaries.test.ts`, same scan of `src/` and `scripts/` |
| upstream_fix writes | only `server/commands/upstream.ts` | `src/boundaries.test.ts`, same scan of `src/` and `scripts/` |
| `app_user.role` and `app_user.active` writes | only `server/commands/accounts.ts` | `src/boundaries.test.ts`, same scan of `src/` and `scripts/` |
| game_follow writes | only `server/commands/follow.ts` | `src/boundaries.test.ts`, same scan of `src/` and `scripts/` |
| profile, profile_step, profile_dependency, adoption_guide writes | only `server/commands/contributions.ts` | `src/boundaries.test.ts`, same scan of `src/` and `scripts/` |
| game_request and game_request_user writes | only `server/commands/game-requests.ts` | `src/boundaries.test.ts`, same scan of `src/` and `scripts/` |
| browser bundle | no server code, no GPU table, no detector script | `scripts/no-server-in-client.ts` after `vite build`, inside `pnpm check` (markers include `OPENGAME_TABLA_GPU` and `Win32_VideoController`) |
| `styles.css` | every rule closed (no accidental nesting), one rule per selector | `src/styles.test.ts` |

Each failure message names the fix, for example: "routes call server fns from src/fns/; never import src/server/ (it would ship pg to the browser)". All three planted violations failed as intended (RATIONALE, Evidence).

## Ownership

| Path | Owns | Does not own |
|---|---|---|
| `domain/ids.ts` | Branded integer ids (including `DependencyId`), text `UserId`, `RequiredText` (trim + non-empty), `OptionalText` (blank → null), `routeIdParser` (`routes/-ids.ts`) | |
| `domain/literals.ts` | `LayerFamily`, `Outcome` with `WorkingOutcome`/`FailingOutcome`, `requiresFailure`, `ProtonVariant`. Imports only `effect`, so `contributions.ts` can spread `tables.ts` fields without a cycle | |
| `domain/compatibility.ts` | `CompatibilityStatus`, `statusByOutcome` (explicit map), **`statusOf`** (the only result-set rule), `ApprovedTest` (row schema that proves approval), **`summarize(tests, now)`** (the one state function for ficha, catalog and diagnosis matrix: last-year base set, `no_recent_confirmation`, `regressions`; a Steam Deck is its own environment), `onDistribution`, `onSteamDeck` ("En Steam Deck"), `workedOnSteamDeck` (the catalog's "Probado en Steam Deck"), `blockedByAntiCheat` (a failing test in the state's base set names `anti_cheat`), **`timeline`** (the ficha's "Historial por versión": approved tests per layer version in first-tested order, each carrying the regressions that broke on it) | Queries, the clock |
| `domain/follow.ts` | `FollowChange` (`Seguir`, `Dejar`, `Visto` with the page's watermark, `seenWatermark` in `server/queries/game.ts`), `News`, **`newsSince`** (approvals after `seen_at`, and the state computed at `seen_at` when it differs from now's), `hasNews` | Storing anything but `seen_at` |
| `domain/recency.ts` | **`isRecent`**, the only 365-day window, for OpenGame's reports (against `now`) and ProtonDB's (against the export date) | |
| `domain/protondb.ts` | The export's boundary Schema (private), `parseReport`, `summarizeProtonDb` (the stored aggregate, deduplicated) | OpenGame's state: nothing here reaches `summarize` |
| `domain/anticheat.ts` | AreWeAntiCheatYet's entry Schema (private), `parseListedGame`, `preferred` (which of two entries for one appId wins), `blocksOnlinePlay` (Broken and Denied) | OpenGame's state: nothing here reaches `summarize` |
| `domain/evaluation.ts` | `OperatingSystem`, `VulkanSupport`, `MachineVulkan` (tagged by `support`; `si` and `no` carry their `origin`, `medido` or `proyectado`, and `si` a `VulkanRange`, one point when measured), `vulkanVersion`/`atLeast`, `vulkanRangeText`, `Capabilities`, `KnownRequirements`, **`evaluate`** (3 outcomes, no FPS field; a projected range that straddles the minimum is `desconocido`), the `requirements` column adapter, `suggestProfile` | Building `Capabilities` from columns (`server/gpu/capability.ts`) |
| `domain/gpu.ts` | `PciId`, `GpuFamily` (15 families), `LinuxDriver`, `D3dPath`, `GpuWarning`, and the `MachineOnLinux` type the GPU card reads. Literals and types only, so it ships to the browser small | The id table, the policy per family |
| `domain/graphics-path.ts` | `RENDER_PATHS` (the one best-first order of graphics paths), **`gamePath`** (a game's declared APIs and minimum x86-64 level against `MachineOnLinux`: `con_ruta`, `sin_ruta`, `sin_datos` with the certain floor, `sin_apis`). Composes `machineOnLinux`'s path and `vulkanStatus`; never recomputes a Vulkan threshold | Vulkan levels per path (`server/gpu/capability.ts`) |
| `domain/distros.ts` | `DISTROS` (sourced facts only, display order), `RULES` (one per objection code, each marking whether it rules the distro out), **`screenDistros`** | Any ranking |
| `domain/max-lengths.ts` | `maxLengths`, every column length limit by table, plus `library.name` for library game names. Imports nothing, so `tables.ts` and `library.ts` share it without a cycle | |
| `domain/steam-game.ts` | `SteamGame` (what the detector's report mode reads about one game: the tool that last ran it and its exact release, whether it runs natively, launch options, build, whether the Steam account was guessed), **`prefillLayer`** (Steam tool to the catalog's layer version, matched only on an exact release, never guessed from a series) | Storing it: nothing does |
| `domain/library.ts` | `STEAM_LAUNCHER`, `MAX_LIBRARY_GAMES` (1000), `SteamAppId`, `SteamStoreRef` (a store link or a bare App ID, decoded to the App ID), `LibraryGame`, `SteamLibrary`, `EvaluatedLibrary`, `isSteamTool` | |
| `domain/readiness.ts` | **`libraryReadiness`** (a Steam library's counts by computed state, the games that work, anti-cheat blocks, "Te frenan" and "Sin evidencia"), `outOfReach` (the machine certainly falls short: `sin_ruta` or a `no_cumple` suggested profile) | The state of each game (`summarize`), the copy |
| `domain/review.ts` | `ReviewStatus`, **`nextStatuses`** (the only transition table), `Decision` (approval requires evidence), `planTransition` (idempotence), `ContributionRef`, `Blocker`, `Role`, `canReview` | Who may decide, preconditions |
| `domain/accounts.ts` | `AccessChange` (the `/admin/usuarios` form: account, role, active), `Access`, `isActiveAdmin` | Who may change it |
| `domain/contributions.ts` | Every input schema (`NewReport` with the failing-result filter, `NewSolution`, `NewGame`, `Capture` with `gpu_pci_id` and `steam_library` and the Linux driver and Vulkan only on its Linux member, `ManualCapture` without the PCI id or library, `DiagnosticInput` with detector text capped at 300 000 characters (derived from `MAX_LIBRARY_GAMES` and `maxLengths.library.name`), `SaveDiagnostic` with `with_library`, `LayerVersionRef`, `TargetMachine`, `CatalogFilter`, `NewProfile` and `ProfileEdit` over `ProfileContent` with `DependencyRef`, `NewGuide`, `GuideEdit`, `RequestGame` (new or existing request), `RejectRequest`, `SteamLookup`), **`mismatches`** (8.7 comparability) | Persisting |
| `domain/errors.ts` | `Rule` + `rules` (field + Spanish message per rule), failure classes, `DomainError`, `Reply`, control errors | |
| `domain/guides.ts` | `GuideType`, `GuideStatus` | |
| `domain/game-requests.ts` | `GameRequestStatus` (`abierto`, `cumplido`, `rechazado`) | |
| `domain/upstream.ts` | `SteamAppId`, `ProtonfixesPr`, `FixNote`, **`exportFix`** (profile → umu-protonfixes file, every untranslated token listed) and **`protonReport`** (report → Valve's compatibility-report). The tokenizer, the brand-gated Python renderer and the GitHub URL builders are private | Sending anything: users open the prefilled links themselves |
| `server/runtime.ts` | `PgLive` (config `DATABASE_URL`), the one `ManagedRuntime`, HMR dispose | |
| `server/auth.ts` | better-auth instance (`app_user` mapping, `rol`/`activo` additionalFields, public sign-up refuses `demoDomain`, a deactivated account gets no new session), `Visitor` service, `visitorOf`, `requireUser`, `requireReviewer` → `Reviewer` brand, `requireAdmin` → `Admin` brand | Data rules |
| `server/run.ts` | `runRead`, `runAction`: session → `Visitor`, transaction per action, control errors → `notFound`/`redirect`, domain failures → `Reply` | Business rules |
| `server/schema/migrations.ts` | All DDL, the rule-home index, and CHECK lists generated from Schema literals | |
| `server/schema/constraints.ts` | `ruleByConstraint` (constraint name → `Rule`), `withDbRules` | |
| `server/commands/contributions.ts` | **Single writer** of report/report_failure/layer_version upsert, solution, game/game_edition (`createGame`, reviewers only; in the same transaction it fulfils the request it started from and any other open request for the new game), profile/profile_step/profile_dependency with the dependency upsert (`proposeProfile`, `editProfile`, `deleteProfile`; `profileEditable` says when the author may still change one) and adoption_guide (`createGuide`, `editGuide`, reviewers only). App-side 8.7/8.9 write rules | The review block, machine/diagnostic |
| `server/commands/diagnostic.ts` | **Single writer** of machine and diagnostic, and the distribution a capture names (`submitDiagnostic`, converging on one machine per alias and one capture per time). Stores `steam_library` only when `with_library` is true | |
| `server/commands/review.ts` | **Single writer** of the review block. `decide`, `approvalBlockers`, the reviewable-table registry | |
| `server/commands/accounts.ts` | **Single writer** of `app_user.role` and `app_user.active` (`changeAccess`, for `/admin/usuarios` through `administerAccess`, `pnpm set-role` and the seed): the last active administrador keeps that access, an administrator never removes their own, a demo administrador changes only demo accounts, and deactivating deletes the account's sessions | Sign-up, passwords, sessions (better-auth) |
| `server/commands/follow.ts` | **Single writer** of game_follow (`changeFollow`, the visitor's own follows): idempotent follow and unfollow; `Visto` moves `seen_at` forward only and never past now | |
| `server/commands/upstream.ts` | **Single writer** of upstream_fix (`noteFix`, reviewers only): merged umu-protonfixes PRs of approved, exportable, non-demo profiles | |
| `server/commands/game-requests.ts` | **Single writer** of game_request and game_request_user. `requestGame` (one open request per game, matched by Steam App ID or by title; keeps an App ID a joiner brings; points to a catalog game instead), `withdrawRequest` (the last requester out deletes it), `rejectRequest` (reviewers only), `fulfillRequests` (called by `createGame`: the request it started from and every open request that asks for the new game). Every writer takes the table lock first | The game itself |
| `server/external/steam.ts` | `steamGame` (reviewers only): the store's appdetails endpoint with a 5-second timeout, the app's only outbound HTTP call (the `--latest` imports call GitHub from `scripts/`, outside the app). `parseAppDetails` reads the answer into title, plain-text description and App ID, or `SteamUnavailable` | Storing anything: the reviewer creates the game through `createGame` |
| `server/external/protondb.ts` | **Single writer** of `protondb_summary`. `arrayElements` (streams a top-level JSON array; the AWACY import reuses it), `importProtonDb` (read all, then replace in one transaction; refuses an older export), `importSummary` | Catalog rows: it only matches existing Steam editions |
| `server/external/anticheat.ts` | **Single writer** of `anticheat_entry`. `importAntiCheat` (read all, then replace in one transaction), `antiCheatSummary` | Catalog rows, like the ProtonDB import |
| `server/external/sources.ts` | **Single writer** of `external_import`. `InvalidExport`, `steamEditions` (what both imports match), `recordImport` and `alreadyImported` (the `--latest` skip), the GitHub listings `latestProtonDbExport` (`newestExport`) and `latestAntiCheatList`, `download` (checked against the listed blob sha by `checkedAgainst`), and the streaming `tarFile`, `utf8` and `jsonInTarGz` | Parsing a source's records |
| `server/queries/*.ts` | Read models: `catalog`, `profile`, `guides`, `guide` (reviewers also see drafts and archived guides), `reportOptions`, `solutionOptions`, `gameOptions`, `profileOptions`, `profileEditOptions`, `guideOptions`, `guideEditOptions`, `gamePage`, `queue`, `evaluateWithoutSaving`, `myDiagnostic`, `myMachines`, `protonDbSummaries` and `antiCheatEntries` (ficha and catalog), `myProtonReport`, `myContributions` (one query per kind; only a refusal carries the reviewer's reason), `accounts` (administrators only), `gameRequests` (`/pedidos`), `myGameRequests` (inside `myContributions`), `myFollows` ("Seguidos") and `session` (the header's visitor and its count of followed games with news, from the same read model). `catalog` matches a title by substring or by trigram word similarity (`pg_trgm`) and ranks by it. Their success types are the page types. `gamePage`, `catalog` and the diagnosis matrix read `now` once from the `Clock` | Writes |
| `server/diagnostics/payload.ts` | **The only detector parser**: `parsePayload` over payload v1, a union on `sistema` (the Windows member has no Vulkan, no kernel driver and no report-mode `juego` block; both carry `dispositivo`). It normalizes `gpu_pci_id` (a malformed id becomes null), the library (drops Steam tools and bad app ids, keeps the first of each id in the detector's order, cuts at 1000) and `rolling`. The private `pciLabel` names a GPU the detector could not name | |
| `server/gpu/capability.ts` | **`machineOnLinux`**, the only builder of what `evaluate` consumes: PCI id to family, the policy per family (Linux driver, Vulkan range, warnings), the Direct3D path. Measured Linux Vulkan wins over the projection, and a Windows row's stored Vulkan is never read | Storing anything |
| `server/gpu/families.generated.ts` | The PCI id to `GpuFamily` table, generated by `pnpm gpu:generate` with its source pins in the header. Never edited by hand | |
| `server/gpu/ranges.ts` | `encodeSpans`/`decodeSpans`, the hex-run format of that table, shared by the generator and `capability.ts` | |
| `fns/*.ts` | The server API surface: one `createServerFn` per operation | Anything else |
| `routes/**` | Pages, loaders, search params, route guards (UX only) | Data rules |
| `ui/useAction.ts` | The one form hook: the form's props (`method="post"` included), decode FormData → call fn → narrow `Reply` → field errors | |
| `routes/-follow.tsx` | `FollowButton` ("Seguir", "Dejar de seguir", and a sign-in link for guests) and `FollowNews` (what changed, with "Marcar como visto"), shared by the ficha and "Seguidos". Under `routes/` because its forms call a server fn | |
| `routes/-search.ts` | `SearchText` and `lenient`, the search-param Schemas shared by `/` and `/pedidos` | |
| `routes/-return-to.ts` | `Destination` and the only parser of `?volver=` on `/entrar` and `/registro`; `returnHere` for route guards | |
| `ui/format.ts` | Display formatting. Every instant prints in Bogotá time with the year (`date` day, `dateTime` day and 24-hour time) | |
| `ui/progress.ts` | The profile page's local step checklist (`localStorage`, SSR-safe) | |
| `ui/vocabulary.ts` | Spanish label and tone for every domain literal, exhaustive via `satisfies Record` | |
| `ui/diagnostics/GraphicsCardOnLinux.tsx` | The "Tu tarjeta gráfica en Linux" card: family, Linux driver, Vulkan labelled "Detectado" or "Proyectado", the Direct3D path with its launch option, and the warnings | |
| `ui/diagnostics/MachineGames.tsx` | The diagnosis matrix, split into "Tu biblioteca de Steam", "Juegos que todavía no conocemos" and "Resto del catálogo" when the capture has a library | |
| `ui/diagnostics/ReadinessSummary.tsx` | The top of "Tu biblioteca de Steam": the headline sentence, the counts by state, "Te frenan" and "Sin evidencia", from `libraryReadiness` over the library rows of the matrix | |
| `ui/compatibility/*` | `GameStatus` (variant 1 badge, the stale note and "Dejó de funcionar"), `EnvironmentMatrix`, `LayerTimeline` ("Historial por versión"), `VerdictForMe` (with the "En tu distribución" line), `ScopedStatus` (one slice of the evidence on a line: "En tu distribución", "En Steam Deck"), `GraphicsPath` (the hardware-only path, apart from the community state and the profile check), evaluation checklist, copy box | |
| `ui/protondb/ProtonDb.tsx` | The ficha's "Otras fuentes: ProtonDB" section, the catalog card line, the ODbL attribution | |
| `ui/anticheat/AntiCheat.tsx` | The ficha's "Otras fuentes: AreWeAntiCheatYet" section, the catalog card line for Broken and Denied, the MIT attribution | |
| `ui/diagnostics/SavedMachines.tsx` | The visitor's machines with links to their saved diagnostics, on `/diagnostico` and `/mis-aportes` | |
| `ui/diagnostics/Distributions.tsx` | The "Distribuciones" section: candidates grouped by verdict with their reasons | |
| `detector/opengame-detect.sh` | The productionized prototype script: payload v1 + `gpu_pci_id` + `biblioteca_steam` + `dispositivo` (Steam Deck from DMI), and with `--game <appid>` the `juego` block read from the game's prefix (`config_info`), Steam's config.vdf and localconfig.vdf, the appmanifest and the tool's version file; with `__OPENGAME_URL__` and `__OPENGAME_MAX_JUEGOS__` filled in by the server route | |
| `detector/opengame-detect.ps1` | The Windows detector for Windows PowerShell 5.1 and pwsh 7, ASCII only, no admin: the same payload without Vulkan or kernel driver. A URL over 2000 characters (the ShellExecute limit) goes to the clipboard and opens `/diagnostico?pegar=1` | |
| `scripts/` | `migrate`, `seed` (approvals only via `decide`; profiles and guides through their writers), `set-role` (through `changeAccess`), `protondb` (`pnpm db:protondb <path \| - \| --latest>`), `anticheat` (`pnpm db:anticheat <path \| - \| --latest>`), `scheduled-imports.sh` (the `imports` service of `compose.prod.yaml`), `no-server-in-client`, `generate-gpus` (`pnpm gpu:generate`) with its pure parsers in `gpu-sources.ts` (the Steam Deck APUs come from pci.ids by codename), which fail closed on an unreadable line, an unknown token or a count under its floor | |
| `tests/` | `support.ts` (rollback-per-test, constraint-name decoder), `setup.ts` (globalSetup: refuses any DB not named `*_test`, rebuilds the schema, migrates), `schema.test.ts`, `contributions.test.ts` | |

## Route map

| Wireframe / RF | Path | Loader / action fns | Auth |
|---|---|---|---|
| 9.1 Inicio + buscador (RF-01, 02) | `/` `?q&estado&lanzador&sin_anti_cheat&steam_deck` | `catalogFn` | public |
| 9.3 Ficha (RF-02, 03, 06, 08, 10) | `/juegos/$gameId` | `gamePageFn`; `changeFollowFn` | public; personal verdict when logged in with a diagnosis; following needs login |
| followed games | `/seguidos` | `myFollowsFn` / `changeFollowFn` | login |
| 9.4 Asistente → profile page (RF-06, 07) | `/perfiles/$profileId` | `profileFn`; reviewers record merged PRs with `noteFixFn` | public (pending shows "en prueba") |
| propose a profile | `/juegos/$gameId/perfiles/nuevo?desde=` | `profileOptionsFn` / `proposeProfileFn` | login |
| edit or delete a profile | `/perfiles/$profileId/editar` | `profileEditOptionsFn` / `editProfileFn`, `deleteProfileFn` | its author only (others get notFound) |
| RF-08 report | `/juegos/$gameId/reportar?perfil=` (report mode adds `diagnostico`, `edicion`, `steam`) | `reportOptionsFn` / `submitReportFn` | login |
| RF-08 solution | `/reportes/$reportId/solucion?tipoFallo=` | `submitSolutionFn` | login |
| 9.2 Diagnóstico (RF-04, 05, 09) | `/diagnostico` `?pegar=1` | `myMachinesFn` / `evaluateDiagnosticFn`, `saveDiagnosticFn` | public evaluation; saving needs login |
| detector landing | `/diagnostico/importar#d=…` (`ssr: false`) | `evaluateDiagnosticFn` | public |
| saved diagnosis | `/diagnosticos/$diagnosticId` | `myDiagnosticFn` | owner only (others get notFound) |
| Proton report for Valve | `/reportes/$reportId/proton` | `protonReportFn` | report owner only (others get notFound) |
| RF-09 guides | `/guias`, `/guias/$guideId` | `guidesFn`, `guideFn` | public; reviewers also see drafts and archived guides |
| RF-09 guide authoring | `/guias/nueva`, `/guias/$guideId/editar` | `guideOptionsFn` / `createGuideFn`, `guideEditOptionsFn` / `editGuideFn` | revisor, administrador |
| RF-10 review | `/revision?tipo=perfil\|reporte\|solucion` | `queueFn` / `decideFn` | revisor, administrador |
| RF-03 new game | `/catalogo/nuevo` `?pedido=` | `gameOptionsFn` / `steamGameFn`, `createGameFn` | revisor, administrador |
| game requests | `/pedidos` `?titulo=` | `gameRequestsFn` / `requestGameFn`, `withdrawRequestFn`; reviewers `rejectRequestFn` | public list; requesting needs login |
| my contributions | `/mis-aportes` | `myContributionsFn` | login |
| role management | `/admin/usuarios` `?q` | `accountsFn` / `changeAccessFn` | administrador (others get notFound) |
| auth | `/entrar`, `/registro`; server route `/api/auth/$` | better-auth client | |
| detector scripts | server routes `/opengame-detect.sh`, `/opengame-detect.ps1` | | public |

## Rule homes

Every 8.7, 8.9 and 8.11 rule has exactly one home. Constraint and trigger names are in `src/server/schema/migrations.ts`.

| Rule | Home |
|---|---|
| PK, FK, UQ, composite keys, no duplicate profile_dependency / report_failure | DB keys |
| enumerated domains, magnitudes, ranges | DB CHECK (lists from domain Schemas) |
| blank strings | DB CHECK *_not_blank (+ RequiredText on input) |
| review block shape per state, approval needs evidence, valid review_status | DB CHECK *_review_block |
| reviewed_at >= created_at | DB CHECK *_reviewed_after_created |
| fps => resolution, graphics_quality, measurement_method | DB CHECK report_fps_with_context |
| Linux capture <=> distribution_id; vulkan version only if si | DB CHECK |
| gpu_pci_id is lowercase `vvvv:dddd`; the library is a JSON array of at most 1000 | DB CHECK diagnostic_gpu_pci_id_format, diagnostic_steam_library_shape (+ PciId, SteamLibrary on input) |
| capture immutable | DB trigger og_immutable |
| machine owner fixed once it has a capture | DB trigger og_owner_fixed |
| report / solution content never rewritten (frozen at birth) | DB trigger og_review_only |
| profile, its steps and deps frozen once reviewed or used | DB trigger og_profile_frozen |
| solution -> report_failure | DB composite FK solution_failure_fk |
| report comparability (edition, layer, distro, arch, version) (edition + layer also a composite FK backstop, unmapped) | app: domain/contributions.ts mismatches (+ DB report_profile_fk) |
| own machine; Linux diagnosis; tested_at >= captured_at | app: server/commands/contributions.ts |
| solution's profile in the report's edition | app: server/commands/contributions.ts |
| one machine per alias per user, one capture per time; the library stored only by the user's choice | app: server/commands/diagnostic.ts |
| measured Linux Vulkan beats the projection; Windows Vulkan is never evaluated | app: server/gpu/capability.ts machineOnLinux |
| failing result has >= 1 failure | app: domain/contributions.ts NewReport |
| reviewer role + activo (also: only reviewers register games) | app: server/auth.ts requireReviewer |
| a deactivated account is a guest and gets no new session | app: server/auth.ts visitorOf + the session create hook |
| the last active administrador keeps that access; an administrator never removes their own | app: server/commands/accounts.ts changeAccess (locks every active administrador) |
| a demo administrador (public password) sees and changes only demo accounts | app: server/commands/accounts.ts changeAccess + server/queries/accounts.ts accounts |
| author != reviewer (all three tables), transitions, approval preconditions | app: server/commands/review.ts decide |
| only reviewers publish guides | app: server/auth.ts requireReviewer, called by createGuide and editGuide |
| a profile changes only by its author, while pending and unused by any report or solution | app: server/commands/contributions.ts profileEditable (+ DB trigger og_profile_frozen) |
| one open request per game (same Steam App ID, or same title when either has none); no open request for a game in the catalog | app: server/commands/game-requests.ts requestGame, serialized by a table lock |
| a request is open with no resolution, fulfilled with a game, or rejected with a reason | DB CHECK game_request_resolution |
| only reviewers reject or fulfil a request | app: server/auth.ts requireReviewer |
| one profile per merged PR; only approved, exportable, non-demo profiles | DB UQ upstream_fix_pr_uq + app: server/commands/upstream.ts |
| upstream_fix rows never rewritten (Anular deletes) | DB trigger og_immutable |
| public view hides retired rows | app: server/queries (WHERE aprobado) |
| state from the approved reports of the last 365 days, else all of them flagged | app: domain/compatibility.ts summarize + domain/recency.ts |
| ProtonDB never feeds the computed state; aggregates only (8.9) | app: no path from domain/protondb.ts to summarize; DB: protondb_summary has no report rows |
| ProtonDB row counts nest, a layer only with its count | DB CHECK protondb_summary_nested_counts, _layer_with_reports, _version_with_variant |
| one follow per user and game | DB PK game_follow (user_id, game_id) |
| a follow's news: approvals after `seen_at`, the state at `seen_at` against now; a retired report counts in neither | app: domain/follow.ts newsSince |
| `seen_at` only moves forward, never past now | app: server/commands/follow.ts changeFollow |
| AreWeAntiCheatYet never feeds the computed state; its Broken and Denied only feed the `sin_anti_cheat` filter and the card | app: no path from domain/anticheat.ts to summarize; server/queries/catalog.ts filters with `blocksOnlinePlay` |

Single writers. `src/boundaries.test.ts` checks the SQL in `src/` and `scripts/` for the first two, the profile and guide tables, and the last seven.

| Tables | Writer |
|---|---|
| `machine`, `diagnostic` (and the `distribution` a capture names) | `server/commands/diagnostic.ts` |
| review block of `profile`, `report`, `solution` | `server/commands/review.ts` `decide` |
| `report` (with `report_failure` and the `layer_version` upsert), `solution`, `game` (with `game_edition`), `profile` (with `profile_step`, `profile_dependency` and the `dependency` upsert), `adoption_guide` | `server/commands/contributions.ts` |
| `protondb_summary` | `server/external/protondb.ts` `importProtonDb` |
| `anticheat_entry` | `server/external/anticheat.ts` `importAntiCheat` |
| `external_import` | `server/external/sources.ts` `recordImport` |
| `upstream_fix` | `server/commands/upstream.ts` `noteFix` |
| `app_user.role`, `app_user.active` | `server/commands/accounts.ts` `changeAccess` |
| `game_follow` | `server/commands/follow.ts` `changeFollow` |
| `game_request`, `game_request_user` | `server/commands/game-requests.ts` |
