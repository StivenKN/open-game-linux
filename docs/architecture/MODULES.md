# Module map

## Dependency direction, and how the build enforces it

```
routes/ ─┬─► fns/ ──► servidor/ ──► dominio/ ──► effect
ui/ ─────┴──────────────────────────► dominio/
```

| Layer | May import | Enforced by |
|---|---|---|
| `src/dominio/` | `effect`, `dominio/` | `src/fronteras.test.ts` |
| `src/servidor/` | `effect`, `@effect/*`, `better-auth`, `pg`, `@tanstack/react-start/server`, `@tanstack/react-router` (only for `notFound`/`redirect` in `ejecutar.ts`), `dominio/`, `servidor/` | same |
| `src/fns/` | `@tanstack/react-start`, `effect`, `dominio/`, `servidor/` | same, plus the rule that **a top-level line is only an import or `export const x = createServerFn(`** (gotcha 3) |
| `src/routes/` | `@tanstack/*`, `react`, `effect`, `dominio/`, `fns/`, `ui/`, `routes/` (helpers in `-*.ts` files the router skips), `detector/`, `assets/`, `better-auth/react` | same. Three allowlisted exceptions, server handlers with no component: `routes/api/auth/$.ts`, `routes/opengame-detect[.]sh.ts` and `routes/opengame-detect[.]ps1.ts` |
| `src/ui/` | `react`, `effect`, `@tanstack/react-router`, `dominio/`, `ui/` | same |
| review block writes | only `servidor/aportes/revision.ts` (and DDL in `servidor/esquema/`) | same test: an SQL template with `SET`/`INSERT INTO` that touches `estado_revision`, `revisor_id` or `evidencia_revision` anywhere else, `scripts/` included, fails |
| equipo/diagnostico writes | only `servidor/aportes/diagnostico.ts` | `src/fronteras.test.ts`, same scan of `src/` and `scripts/` |
| browser bundle | no server code, no GPU table, no detector script | `scripts/sin-servidor-en-cliente.ts` after `vite build`, inside `pnpm check` (markers include `OPENGAME_TABLA_GPU` and `Win32_VideoController`) |
| `styles.css` | every rule closed (no accidental nesting), one rule per selector | `src/styles.test.ts` |

Each failure message names the fix, for example: "routes call server fns from src/fns/; never import src/servidor/ (it would ship pg to the browser)". All three planted violations failed as intended (RATIONALE, Evidence).

## Ownership

| Path | Owns | Does not own |
|---|---|---|
| `dominio/ids.ts` | Branded integer ids (including `DependenciaId`), text `UsuarioId`, `Texto` (trim + non-empty), `TextoOpcional` (blank → null), `idDeRuta` (`routes/-ids.ts`) | |
| `dominio/literales.ts` | `FamiliaCapa`, `Resultado` with `ResultadoFuncional`/`ResultadoFallido`, `exigeFallo`. Imports only `effect`, so `aportes.ts` can spread `tablas.ts` fields without a cycle | |
| `dominio/compatibilidad.ts` | `EstadoCompatibilidad`, `estadoDeResultado` (explicit map), **`estadoDe`** (the only result-set rule), `PruebaAprobada` (row schema that proves approval), `resumir`, `enDistribucion` | Queries |
| `dominio/evaluacion.ts` | `Sistema`, `SoporteVulkan`, `VulkanEquipo` (tagged by `origen`: `medido`, `proyectado` as a range, or `desconocido`), `versionVulkan`/`alMenos`, `rangoVulkan`, `Capacidades`, `CondicionesConocidas`, **`evaluar`** (3 outcomes, no FPS field; a projected range that straddles the minimum is `desconocido`), the `condiciones` column adapter, `sugerirPerfil` | Building `Capacidades` from columns (`servidor/gpu/capacidad.ts`) |
| `dominio/gpu.ts` | `PciId`, `FamiliaGpu` (15 families), `ControladorLinux`, `RutaD3d`, `AvisoGpu`, and the `EquipoEnLinux` type the GPU card reads. Literals and types only, so it ships to the browser small | The id table, the policy per family |
| `dominio/biblioteca.ts` | `LANZADOR_STEAM`, `MAX_JUEGOS_BIBLIOTECA` (1000), `AppIdSteam`, `JuegoBiblioteca`, `BibliotecaSteam`, `esHerramientaSteam` | |
| `dominio/revision.ts` | `EstadoRevision`, **`siguientes`** (the only transition table), `Decision` (approval requires evidence), `planificar` (idempotence), `AporteRef`, `Bloqueo`, `Rol`, `puedeRevisar` | Who may decide, preconditions |
| `dominio/aportes.ts` | Every input schema (`NuevoReporte` with the failing-result filter, `NuevaSolucion`, `NuevoJuego`, `Captura` with `gpu_pci_id` and `biblioteca_steam`, `EntradaDiagnostico` with detector text capped at 300 000 characters, `GuardarDiagnostico` with `con_biblioteca`, `VersionCapaRef`, `EquipoDestino`, `FiltroCatalogo`), **`discrepancias`** (8.7 comparability) | Persisting |
| `dominio/fallos.ts` | `Regla` + `reglas` (field + Spanish message per rule), failure classes, `FalloDominio`, `Respuesta`, control errors | |
| `dominio/guias.ts` | `TipoGuia`, `EstadoGuia` | |
| `servidor/runtime.ts` | `PgLive` (config `DATABASE_URL`), the one `ManagedRuntime`, HMR dispose | |
| `servidor/auth.ts` | better-auth instance (usuario mapping, `rol`/`activo` additionalFields, public sign-up refuses `dominioDemo`), `Visitante` service, `visitanteDe`, `exigirUsuario`, `exigirRevisor` → `Revisor` brand | Data rules |
| `servidor/ejecutar.ts` | `leer`, `accion`: session → `Visitante`, transaction per action, control errors → `notFound`/`redirect`, domain failures → `Respuesta` | Business rules |
| `servidor/esquema/migraciones.ts` | All DDL, the rule-home index, and CHECK lists generated from Schema literals | |
| `servidor/esquema/restricciones.ts` | `reglaDeRestriccion` (constraint name → `Regla`), `conReglasDeBd` | |
| `servidor/aportes/aportes.ts` | **Single writer** of reporte/reporte_fallo/version_capa upsert, solucion, and juego/edicion_juego (`crearJuego`, reviewers only). App-side 8.7/8.9 write rules | The review block, equipo/diagnostico |
| `servidor/aportes/diagnostico.ts` | **Single writer** of equipo and diagnostico, and the distribucion a capture names (`registrarDiagnostico`, converging on one equipo per alias and one capture per time). Stores `biblioteca_steam` only when `con_biblioteca` is true | |
| `servidor/aportes/revision.ts` | **Single writer** of the review block. `decidir`, `bloqueosAprobacion`, the reviewable-table registry | |
| `servidor/consultas/*.ts` | Read models: `catalogo`, `perfil`, `guias`, `guia`, `opcionesReporte`, `opcionesSolucion`, `opcionesJuego`, `fichaJuego`, `cola`, `evaluarSinGuardar`, `miDiagnostico`, `misEquipos`. Their success types are the page types | Writes |
| `servidor/diagnostico/payload.ts` | **The only detector parser**: `parsearPayload` over payload v1, a union on `sistema` (the Windows member has no Vulkan and no kernel driver). It normalizes `gpu_pci_id` (a malformed id becomes null), the library (drops Steam tools and bad app ids, keeps the first of each id in the detector's order, cuts at 1000) and `rolling`. The private `etiquetaPci` names a GPU the detector could not name | |
| `servidor/gpu/capacidad.ts` | **`equipoEnLinux`**, the only builder of what `evaluar` consumes: PCI id to family, the policy per family (Linux driver, Vulkan range, warnings), the Direct3D path. Measured Linux Vulkan wins over the projection, and a Windows row's stored Vulkan is never read | Storing anything |
| `servidor/gpu/familias.generado.ts` | The PCI id to `FamiliaGpu` table, generated by `pnpm gpu:generar` with its source pins in the header. Never edited by hand | |
| `fns/*.ts` | The server API surface: one `createServerFn` per operation | Anything else |
| `routes/**` | Pages, loaders, search params, route guards (UX only) | Data rules |
| `ui/useAccion.ts` | The one form hook: the form's props (`method="post"` included), decode FormData → call fn → narrow `Respuesta` → field errors | |
| `routes/-volver.ts` | `Destino` and the only parser of `?volver=` on `/entrar` and `/registro`; `volverAqui` for route guards | |
| `ui/formato.ts` | Display formatting. Every instant prints in Bogotá time (`fecha` day, `momento` day and 24-hour time) | |
| `ui/progreso.ts` | The profile page's local step checklist (`localStorage`, SSR-safe) | |
| `ui/vocabulario.ts` | Spanish label and tone for every domain literal, exhaustive via `satisfies Record` | |
| `ui/diagnostico/TarjetaGraficaEnLinux.tsx` | The "Tu tarjeta gráfica en Linux" card: family, Linux driver, Vulkan labelled "Detectado" or "Proyectado", the Direct3D path with its launch option, and the warnings | |
| `ui/diagnostico/JuegosDelEquipo.tsx` | The diagnosis matrix, split into "Tu biblioteca de Steam", "Juegos que todavía no conocemos" and "Resto del catálogo" when the capture has a library | |
| `ui/compatibilidad/*` | `EstadoJuego` (variant 1 badge), `MatrizEntornos`, `VeredictoParaMi` (with the "En tu distribución" line), evaluation checklist, copy box | |
| `detector/opengame-detect.sh` | The productionized prototype script: payload v1 + `gpu_pci_id` + `biblioteca_steam`, with `__OPENGAME_URL__` and `__OPENGAME_MAX_JUEGOS__` filled in by the server route | |
| `detector/opengame-detect.ps1` | The Windows detector for Windows PowerShell 5.1 and pwsh 7, ASCII only, no admin: the same payload without Vulkan or kernel driver. A URL over 2000 characters (the ShellExecute limit) goes to the clipboard and opens `/diagnostico?pegar=1` | |
| `scripts/` | `migrar`, `sembrar` (approvals only via `decidir`), `rol`, `sin-servidor-en-cliente`, `generar-gpus` (`pnpm gpu:generar`) with its pure parsers in `gpu-fuentes.ts`, which fail closed on an unreadable line, an unknown token or a count under its floor | |
| `tests/` | `apoyo.ts` (rollback-per-test, constraint-name decoder), `preparar.ts` (globalSetup: refuses any DB not named `*_test`, rebuilds the schema, migrates), `esquema.test.ts`, `aportes.test.ts` | |

## Route map

| Wireframe / RF | Path | Loader / action fns | Auth |
|---|---|---|---|
| 9.1 Inicio + buscador (RF-01, 02) | `/` `?q&estado&lanzador&sin_anti_cheat` | `catalogoFn` | public |
| 9.3 Ficha (RF-02, 03, 06, 08, 10) | `/juegos/$juegoId` | `fichaJuegoFn` | public; personal verdict when logged in with a diagnosis |
| 9.4 Asistente → profile page (RF-06, 07) | `/perfiles/$perfilId` | `perfilFn` | public (pending shows "en prueba") |
| RF-08 report | `/juegos/$juegoId/reportar?perfil=` | `opcionesReporteFn` / `registrarReporteFn` | login |
| RF-08 solution | `/reportes/$reporteId/solucion?tipoFallo=` | `registrarSolucionFn` | login |
| 9.2 Diagnóstico (RF-04, 05, 09) | `/diagnostico` `?pegar=1` | `misEquiposFn` / `evaluarDiagnosticoFn`, `guardarDiagnosticoFn` | public evaluation; saving needs login |
| detector landing | `/diagnostico/importar#d=…` (`ssr: false`) | `evaluarDiagnosticoFn` | public |
| saved diagnosis | `/diagnosticos/$diagnosticoId` | `miDiagnosticoFn` | owner only (others get notFound) |
| RF-09 guides | `/guias`, `/guias/$guiaId` | `guiasFn`, `guiaFn` | public |
| RF-10 review | `/revision?tipo=perfil\|reporte\|solucion` | `colaFn` / `decidirFn` | revisor, administrador |
| RF-03 new game | `/catalogo/nuevo` | `crearJuegoFn` | revisor, administrador |
| auth | `/entrar`, `/registro`; server route `/api/auth/$` | better-auth client | |
| detector scripts | server routes `/opengame-detect.sh`, `/opengame-detect.ps1` | | public |

## Rule homes

Every 8.7, 8.9 and 8.11 rule has exactly one home. Constraint and trigger names are in `src/servidor/esquema/migraciones.ts`.

| Rule | Home |
|---|---|
| PK, FK, UQ, composite keys, no duplicate dependencia / fallo | DB keys |
| enumerated domains, magnitudes, ranges | DB CHECK (lists from dominio Schemas) |
| blank strings | DB CHECK *_no_vacio (+ Texto on input) |
| review block shape per state, approval needs evidence, valid estado_revision | DB CHECK *_bloque_revision |
| revisado_en >= creado_en | DB CHECK *_revision_posterior |
| fps => resolucion, calidad, metodo | DB CHECK reporte_fps_con_contexto |
| Linux capture <=> distribucion_id; vulkan version only if si | DB CHECK |
| gpu_pci_id is lowercase `vvvv:dddd`; the library is a JSON array of at most 1000 | DB CHECK diagnostico_gpu_pci_id_formato, diagnostico_biblioteca_steam_forma (+ PciId, BibliotecaSteam on input) |
| capture immutable | DB trigger og_inmutable |
| equipo owner fixed once it has a capture | DB trigger og_propietario_fijo |
| report / solution content never rewritten (frozen at birth) | DB trigger og_solo_revision |
| profile, its steps and deps frozen once reviewed or used | DB trigger og_perfil_congelado |
| solucion -> reporte_fallo | DB composite FK solucion_fallo_fk |
| report comparability (edition, layer, distro, arch, version) (edition + layer also a composite FK backstop, unmapped) | app: dominio/aportes.ts discrepancias (+ DB reporte_perfil_fk) |
| own equipo; Linux diagnosis; fecha_prueba >= capturado_en | app: servidor/aportes/aportes.ts |
| solution's profile in the report's edition | app: servidor/aportes/aportes.ts |
| one equipo per alias per user, one capture per time; the library stored only by the user's choice | app: servidor/aportes/diagnostico.ts |
| measured Linux Vulkan beats the projection; Windows Vulkan is never evaluated | app: servidor/gpu/capacidad.ts equipoEnLinux |
| failing result has >= 1 fallo | app: dominio/aportes.ts NuevoReporte |
| reviewer role + activo (also: only reviewers register games) | app: servidor/auth.ts exigirRevisor |
| author != reviewer (all three tables), transitions, approval preconditions | app: servidor/aportes/revision.ts decidir |
| only reviewers publish guides | no write path this delivery (seeded) |
| public view hides retired rows | app: servidor/consultas (WHERE aprobado) |

Single writers. `src/fronteras.test.ts` checks the SQL in `src/` and `scripts/` for the first two.

| Tables | Writer |
|---|---|
| `equipo`, `diagnostico` (and the `distribucion` a capture names) | `servidor/aportes/diagnostico.ts` |
| review block of `perfil_configuracion`, `reporte`, `solucion` | `servidor/aportes/revision.ts` `decidir` |
| `reporte` (with `reporte_fallo` and the `version_capa` upsert), `solucion`, `juego` (with `edicion_juego`) | `servidor/aportes/aportes.ts` |
