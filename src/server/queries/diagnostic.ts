import { Effect, Option, Schema } from 'effect'
import { SqlClient } from 'effect/sql'
import type { Capture, DiagnosticInput } from '../../domain/contributions.ts'
import { type EvaluatedLibrary, type SteamLibrary, STEAM_LAUNCHER } from '../../domain/library.ts'
import { statusOf } from '../../domain/compatibility.ts'
import { screenDistros, type EvaluatedDistro } from '../../domain/distros.ts'
import { requirements, evaluate, suggestProfile } from '../../domain/evaluation.ts'
import type { MachineOnLinux } from '../../domain/gpu.ts'
import { NotFound, type InvalidPayload } from '../../domain/errors.ts'
import type { DiagnosticId, GuideId, GameId } from '../../domain/ids.ts'
import { GraphicsApi, Outcome } from '../../domain/literals.ts'
import type { X86Level } from '../../domain/platform.ts'
import { gamePath } from '../../domain/graphics-path.ts'
import { Diagnostic, Distribution, Machine, AdoptionGuide, Game, Profile } from '../../domain/tables.ts'
import { requireUser, Visitor } from '../auth.ts'
import { captureOf } from '../diagnostics/payload.ts'
import { machineOnLinux } from '../gpu/capability.ts'
import { rows, type Infra } from '../rows.ts'
import { layerLabel, distributionLabel } from './labels.ts'

const GameRow = Schema.Struct({ id: Game.fields.id, titulo: Game.fields.titulo, nivel_x86_min: Game.fields.nivel_x86_min, apis: Schema.Array(GraphicsApi) })
const ApprovedOutcome = Schema.Struct({ juego_id: Game.fields.id, resultado: Outcome })

const ApprovedProfile = Schema.Struct({
  id: Profile.fields.id,
  juego_id: Game.fields.id,
  titulo: Profile.fields.titulo,
  revision: Profile.fields.revision,
  distribucion_id: Profile.fields.distribucion_id,
  arquitectura: Profile.fields.arquitectura,
  ram_min_mb: Profile.fields.ram_min_mb,
  vram_min_mb: Profile.fields.vram_min_mb,
  requiere_vulkan: Profile.fields.requiere_vulkan,
  version_vulkan_min: Profile.fields.version_vulkan_min,
  capa: Schema.String,
  distribucion: Schema.String,
})

/** The capture facts beyond the GPU that the verdicts read. */
type Setup = { readonly distribucion_id: typeof Distribution.Type.id | null; readonly arquitectura: string; readonly nivel_x86: X86Level | null }

const matrix = (machine: MachineOnLinux, setup: Setup, inLibrary: ReadonlySet<GameId>) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const games = yield* rows(
      GameRow,
      sql`
        SELECT j.id, j.titulo, j.nivel_x86_min, COALESCE(array_agg(ja.api) FILTER (WHERE ja.api IS NOT NULL), '{}') AS apis
        FROM juego j LEFT JOIN juego_api ja ON ja.juego_id = j.id
        GROUP BY j.id
        ORDER BY j.titulo, j.id`,
    )
    const outcomes = yield* rows(
      ApprovedOutcome,
      sql`
        SELECT ej.juego_id, r.resultado FROM reporte r JOIN edicion_juego ej ON ej.id = r.edicion_id
        WHERE r.estado_revision = 'aprobado'`,
    )
    const profiles = yield* rows(
      ApprovedProfile,
      sql`
        SELECT p.id, ej.juego_id, p.titulo, p.revision, p.distribucion_id, p.arquitectura,
               p.ram_min_mb, p.vram_min_mb, p.requiere_vulkan, p.version_vulkan_min,
               ${sql.literal(layerLabel('vc'))} AS capa, ${sql.literal(distributionLabel('d'))} AS distribucion
        FROM perfil_configuracion p
        JOIN edicion_juego ej ON ej.id = p.edicion_id
        JOIN version_capa vc ON vc.id = p.version_capa_id
        JOIN distribucion d ON d.id = p.distribucion_id
        WHERE p.estado_revision = 'aprobado'
        ORDER BY p.id`,
    )
    return games.map((game) => {
      const approved = outcomes.filter((r) => r.juego_id === game.id).map((r) => r.resultado)
      const evaluated = profiles.filter((p) => p.juego_id === game.id).map((p) => ({ ...p, evaluation: evaluate(machine, requirements(p)) }))
      const profile = suggestProfile(evaluated, setup)
      return {
        juego_id: game.id,
        titulo: game.titulo,
        in_library: inLibrary.has(game.id),
        status: statusOf(approved),
        test_count: approved.length,
        nivel_x86_min: game.nivel_x86_min,
        path: gamePath(machine, setup.nivel_x86, game),
        profile:
          profile === null
            ? null
            : { id: profile.id, titulo: profile.titulo, revision: profile.revision, capa: profile.capa, distribucion: profile.distribucion, evaluation: profile.evaluation },
      }
    })
  })

export type MatrixRow = Effect.Success<ReturnType<typeof matrix>>[number]

const SteamEdition = Schema.Struct({ app_id: Schema.String, juego_id: Game.fields.id })

const splitLibrary = (games: SteamLibrary) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const editions =
      games.length === 0
        ? []
        : yield* rows(
            SteamEdition,
            sql`
              SELECT ej.identificador_externo AS app_id, ej.juego_id FROM edicion_juego ej JOIN lanzador l ON l.id = ej.lanzador_id
              WHERE l.nombre = ${STEAM_LAUNCHER} AND ej.identificador_externo IN ${sql.in(games.map((j) => String(j.app_id)))}`,
          )
    const known = new Set(editions.map((e) => e.app_id))
    return {
      inCatalog: new Set(editions.map((e) => e.juego_id)),
      library: { total: games.length, unknown: games.filter((j) => !known.has(String(j.app_id))) },
    }
  })

const DistributionGuide = Schema.Struct({ id: AdoptionGuide.fields.id })

const evaluateMachine = (machine: MachineOnLinux, setup: Setup, games: SteamLibrary | null) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const split = games === null ? null : yield* splitLibrary(games)
    const [guide] = yield* rows(
      DistributionGuide,
      sql`SELECT id FROM guia_adopcion WHERE tipo = 'eleccion_distribucion' AND estado = 'publicada' ORDER BY id LIMIT 1`,
    )
    return {
      matrix: yield* matrix(machine, setup, split?.inCatalog ?? new Set()),
      library: split?.library ?? null,
      distributions: { guide: guide?.id ?? null, evaluated: screenDistros(machine, setup.arquitectura) },
    }
  })

export const evaluateWithoutSaving = (
  input: DiagnosticInput,
): Effect.Effect<
  {
    readonly capture: Capture
    readonly machine: MachineOnLinux
    readonly matrix: ReadonlyArray<MatrixRow>
    readonly library: EvaluatedLibrary | null
    readonly distributions: { readonly guide: GuideId | null; readonly evaluated: ReadonlyArray<EvaluatedDistro> }
  },
  InvalidPayload | Infra,
  SqlClient.SqlClient
> =>
  Effect.gen(function* () {
    const capture = yield* captureOf(input)
    const sql = yield* SqlClient.SqlClient
    const [distribution] =
      capture.sistema === 'Linux'
        ? yield* rows(
            Schema.Struct({ id: Distribution.fields.id }),
            sql`SELECT id FROM distribucion WHERE nombre = ${capture.distribucion.nombre} AND version = ${capture.distribucion.version}`,
          )
        : []
    const machine = machineOnLinux(capture)
    const setup = { distribucion_id: distribution?.id ?? null, arquitectura: capture.arquitectura, nivel_x86: capture.nivel_x86 }
    return { capture, machine, ...(yield* evaluateMachine(machine, setup, capture.biblioteca_steam)) }
  })

const SavedDiagnostic = Schema.Struct({
  ...Diagnostic.fields,
  alias: Machine.fields.alias,
  distribucion: Schema.NullOr(Schema.Struct({ nombre: Distribution.fields.nombre, version: Distribution.fields.version })),
})

const savedCapture = (d: typeof SavedDiagnostic.Type): Effect.Effect<Capture> => {
  const common = {
    capturado_en: d.capturado_en,
    version_sistema: d.version_sistema,
    arquitectura: d.arquitectura,
    cpu_modelo: d.cpu_modelo,
    gpu_modelo: d.gpu_modelo,
    ram_mb: d.ram_mb,
    vram_mb: d.vram_mb,
    nivel_x86: d.nivel_x86,
    arranque_seguro: d.arranque_seguro,
    tpm: d.tpm,
    zram_mb: d.zram_mb,
    swap_mb: d.swap_mb,
    gpu_pci_id: d.gpu_pci_id,
    biblioteca_steam: d.biblioteca_steam,
  }
  if (d.sistema === 'Windows') return Effect.succeed({ ...common, sistema: 'Windows' })
  if (d.distribucion === null) return Effect.die(`diagnostico ${d.id}: Linux sin distribucion`)
  return Effect.succeed({
    ...common,
    sistema: 'Linux',
    distribucion: d.distribucion,
    controlador: d.controlador,
    version_controlador: d.version_controlador,
    soporte_vulkan: d.soporte_vulkan,
    version_vulkan: d.version_vulkan,
  })
}

export const myDiagnostic = (id: DiagnosticId) =>
  Effect.gen(function* () {
    const user = yield* requireUser
    const sql = yield* SqlClient.SqlClient
    const [d] = yield* rows(
      SavedDiagnostic,
      sql`
        SELECT d.*, e.alias,
               CASE WHEN dist.id IS NULL THEN NULL ELSE json_build_object('nombre', dist.nombre, 'version', dist.version) END AS distribucion
        FROM diagnostico d
        JOIN equipo e ON e.id = d.equipo_id
        LEFT JOIN distribucion dist ON dist.id = d.distribucion_id
        WHERE d.id = ${id} AND e.usuario_id = ${user.id}`,
    )
    if (d === undefined) return yield* Effect.fail(new NotFound())
    const machine = machineOnLinux(d)
    return { id: d.id, alias: d.alias, capture: yield* savedCapture(d), machine, ...(yield* evaluateMachine(machine, d, d.biblioteca_steam)) }
  })

const MachineRow = Schema.Struct({ id: Machine.fields.id, alias: Machine.fields.alias })
const CaptureSummary = Schema.Struct({
  id: Diagnostic.fields.id,
  equipo_id: Diagnostic.fields.equipo_id,
  capturado_en: Diagnostic.fields.capturado_en,
  sistema: Diagnostic.fields.sistema,
  gpu_modelo: Diagnostic.fields.gpu_modelo,
  ram_mb: Diagnostic.fields.ram_mb,
  distribucion: Schema.NullOr(Schema.String),
})

export const myMachines = () =>
  Effect.gen(function* () {
    const visitor = yield* Visitor
    if (Option.isNone(visitor)) return []
    const sql = yield* SqlClient.SqlClient
    const machines = yield* rows(
      MachineRow,
      sql`SELECT id, alias FROM equipo WHERE usuario_id = ${visitor.value.id} ORDER BY creado_en, id`,
    )
    const captures = yield* rows(
      CaptureSummary,
      sql`
        SELECT d.id, d.equipo_id, d.capturado_en, d.sistema, d.gpu_modelo, d.ram_mb, ${sql.literal(distributionLabel('dist'))} AS distribucion
        FROM diagnostico d
        JOIN equipo e ON e.id = d.equipo_id
        LEFT JOIN distribucion dist ON dist.id = d.distribucion_id
        WHERE e.usuario_id = ${visitor.value.id}
        ORDER BY d.capturado_en DESC, d.id DESC`,
    )
    return machines.map((e) => ({ ...e, diagnostics: captures.filter((c) => c.equipo_id === e.id) }))
  })
