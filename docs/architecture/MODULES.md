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
| `src/routes/` | `@tanstack/*`, `react`, `effect`, `dominio/`, `fns/`, `ui/`, `detector/`, `better-auth/react` | same. One allowlisted exception: `routes/api/auth/$.ts`, a server handler with no component |
| `src/ui/` | `react`, `effect`, `@tanstack/react-router`, `dominio/`, `ui/` | same |
| review block writes | only `servidor/aportes/revision.ts` (and DDL in `servidor/esquema/`) | same test: an SQL template with `SET`/`INSERT INTO` that touches `estado_revision`, `revisor_id` or `evidencia_revision` anywhere else, `scripts/` included, fails |
| browser bundle | no server code | `scripts/sin-servidor-en-cliente.ts` after `vite build`, inside `pnpm check` |

Each failure message names the fix, for example: "routes call server fns from src/fns/; never import src/servidor/ (it would ship pg to the browser)". All three planted violations failed as intended (RATIONALE, Evidence).

## Ownership

| Path | Owns | Does not own |
|---|---|---|
| `dominio/ids.ts` | Branded integer ids, text `UsuarioId`, `Texto` (trim + non-empty), `TextoOpcional` (blank → null), `IdDesdeTexto` | |
| `dominio/compatibilidad.ts` | `Resultado`, `EstadoCompatibilidad`, `estadoDeResultado` (explicit map), `exigeFallo`, **`estadoDe`** (the only result-set rule), `PruebaAprobada` (row schema that proves approval), `resumir`, `enDistribucion` | Queries |
| `dominio/evaluacion.ts` | `Sistema`, `SoporteVulkan`, `Vulkan` (a version only with `si`), `versionVulkan`/`alMenos`, `Capacidades`, `CondicionesConocidas`, **`evaluar`** (3 outcomes, no FPS field), `capacidades`/`condiciones` column adapters, `sugerirPerfil` | |
| `dominio/revision.ts` | `EstadoRevision`, **`siguientes`** (the only transition table), `Decision` (approval requires evidence), `planificar` (idempotence), `AporteRef`, `Bloqueo`, `Rol`, `puedeRevisar` | Who may decide, preconditions |
| `dominio/aportes.ts` | Every input schema (`NuevoReporte` with the failing-result filter, `NuevaSolucion`, `NuevoJuego`, `Captura`, `EntradaDiagnostico`, `GuardarDiagnostico`, `VersionCapaRef`, `EquipoDestino`, `FiltroCatalogo`), **`discrepancias`** (8.7 comparability) | Persisting |
| `dominio/fallos.ts` | `Regla` + `reglas` (field + Spanish message per rule), failure classes, `FalloDominio`, `Respuesta`, control errors | |
| `dominio/guias.ts` | `TipoGuia`, `EstadoGuia` | |
| `servidor/runtime.ts` | `PgLive` (config `DATABASE_URL`), the one `ManagedRuntime`, HMR dispose | |
| `servidor/auth.ts` | better-auth instance (usuario mapping, `rol`/`activo` additionalFields), `Visitante` service, `visitanteDe`, `exigirUsuario`, `exigirRevisor` → `Revisor` brand | Data rules |
| `servidor/ejecutar.ts` | `leer`, `accion`: session → `Visitante`, transaction per action, control errors → `notFound`/`redirect`, domain failures → `Respuesta` | Business rules |
| `servidor/esquema/migraciones.ts` | All DDL, the rule-home index, and CHECK lists generated from Schema literals | |
| `servidor/esquema/restricciones.ts` | `reglaDeRestriccion` (constraint name → `Regla`), `conReglasDeBd` | |
| `servidor/aportes/aportes.ts` | **Single writer** of diagnostico/equipo/distribucion upsert, reporte/reporte_fallo/version_capa upsert, solucion, juego/edicion. App-side 8.7/8.9 write rules | The review block |
| `servidor/aportes/revision.ts` | **Single writer** of the review block. `decidir`, `bloqueosAprobacion`, the reviewable-table registry | |
| `servidor/consultas/*.ts` | Read models: `catalogo`, `perfil`, `guias`, `guia`, `opcionesReporte`, `fichaJuego`, `cola`, `evaluarSinGuardar`, `miDiagnostico`, `misEquipos`. Their success types are the page types | Writes |
| `servidor/diagnostico/payload.ts` | **The only detector parser**: `parsearPayload`, `etiquetaPci`, `rolling` normalization | |
| `fns/*.ts` | The server API surface: one `createServerFn` per operation | Anything else |
| `routes/**` | Pages, loaders, search params, route guards (UX only) | Data rules |
| `ui/useAccion.ts` | The one form hook: decode FormData → call fn → narrow `Respuesta` → field errors | |
| `ui/vocabulario.ts` | Spanish label and tone for every domain literal, exhaustive via `satisfies Record` | |
| `ui/compatibilidad/*` | `EstadoJuego` (variant 1 badge), `MatrizEntornos`, `VeredictoParaMi` (with the "En tu distribución" line), evaluation checklist, copy box | |
| `detector/opengame-detect.sh` | The productionized prototype script: payload v1 + `gpu_pci_id`, with `__OPENGAME_URL__` filled in by the server route | |
| `scripts/` | `migrar`, `sembrar` (approvals only via `decidir`), `rol`, `sin-servidor-en-cliente` | |
| `tests/` | `apoyo.ts` (rollback-per-test, constraint-name decoder), `preparar.ts` (globalSetup: refuses any DB not named `*_test`, rebuilds the schema, migrates), `esquema.test.ts`, `aportes.test.ts` | |

## Route map

| Wireframe / RF | Path | Loader / action fns | Auth |
|---|---|---|---|
| 9.1 Inicio + buscador (RF-01, 02) | `/` `?q&estado&lanzador&sin_anti_cheat` | `catalogoFn` | public |
| 9.3 Ficha (RF-02, 03, 06, 08, 10) | `/juegos/$juegoId` | `fichaJuegoFn` | public; personal verdict when logged in with a diagnosis |
| 9.4 Asistente → profile page (RF-06, 07) | `/perfiles/$perfilId` | `perfilFn` | public (pending shows "en prueba") |
| RF-08 report | `/juegos/$juegoId/reportar?perfil=` | `opcionesReporteFn` / `registrarReporteFn` | login |
| RF-08 solution | `/reportes/$reporteId/solucion?tipoFallo=` | `registrarSolucionFn` | login |
| 9.2 Diagnóstico (RF-04, 05, 09) | `/diagnostico` | `misEquiposFn` / `evaluarDiagnosticoFn`, `guardarDiagnosticoFn` | public evaluation; saving needs login |
| detector landing | `/diagnostico/importar#d=…` (`ssr: false`) | `evaluarDiagnosticoFn` | public |
| saved diagnosis | `/diagnosticos/$diagnosticoId` | `miDiagnosticoFn` | owner only (others get notFound) |
| RF-09 guides | `/guias`, `/guias/$guiaId` | `guiasFn`, `guiaFn` | public |
| RF-10 review | `/revision?tipo=perfil\|reporte\|solucion` | `colaFn` / `decidirFn` | revisor, administrador |
| RF-03 new game | `/catalogo/nuevo` | `crearJuegoFn` | revisor, administrador |
| auth | `/entrar`, `/registro`; server route `/api/auth/$` | better-auth client | |
| detector script | server route `/opengame-detect.sh` | | public |

## Rule homes

The authoritative table is the header of `sketch/src/servidor/esquema/migraciones.ts`. In short: row-local rules are DB constraints and three triggers. Cross-row write rules are in `servidor/aportes/aportes.ts`. Review rules are in `servidor/aportes/revision.ts`. Comparability is in `dominio/aportes.ts` `discrepancias`. The failing-result rule is in `dominio/aportes.ts` `NuevoReporte`. Reviewer role is in `servidor/auth.ts` `exigirRevisor`.
