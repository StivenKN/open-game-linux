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

const GameRow = Schema.Struct({ id: Game.fields.id, title: Game.fields.title, x86_level_min: Game.fields.x86_level_min, apis: Schema.Array(GraphicsApi) })
const ApprovedOutcome = Schema.Struct({ game_id: Game.fields.id, outcome: Outcome })

const ApprovedProfile = Schema.Struct({
  id: Profile.fields.id,
  game_id: Game.fields.id,
  title: Profile.fields.title,
  revision: Profile.fields.revision,
  distribution_id: Profile.fields.distribution_id,
  architecture: Profile.fields.architecture,
  ram_min_mb: Profile.fields.ram_min_mb,
  vram_min_mb: Profile.fields.vram_min_mb,
  requires_vulkan: Profile.fields.requires_vulkan,
  vulkan_version_min: Profile.fields.vulkan_version_min,
  layer: Schema.String,
  distribution: Schema.String,
})

/** The capture facts beyond the GPU that the verdicts read. */
type Setup = { readonly distribution_id: typeof Distribution.Type.id | null; readonly architecture: string; readonly x86_level: X86Level | null }

const matrix = (machine: MachineOnLinux, setup: Setup, inLibrary: ReadonlySet<GameId>) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const games = yield* rows(
      GameRow,
      sql`
        SELECT j.id, j.title, j.x86_level_min, COALESCE(array_agg(ja.api) FILTER (WHERE ja.api IS NOT NULL), '{}') AS apis
        FROM game j LEFT JOIN game_api ja ON ja.game_id = j.id
        GROUP BY j.id
        ORDER BY j.title, j.id`,
    )
    const outcomes = yield* rows(
      ApprovedOutcome,
      sql`
        SELECT ej.game_id, r.outcome FROM report r JOIN game_edition ej ON ej.id = r.edition_id
        WHERE r.review_status = 'aprobado'`,
    )
    const profiles = yield* rows(
      ApprovedProfile,
      sql`
        SELECT p.id, ej.game_id, p.title, p.revision, p.distribution_id, p.architecture,
               p.ram_min_mb, p.vram_min_mb, p.requires_vulkan, p.vulkan_version_min,
               ${sql.literal(layerLabel('vc'))} AS layer, ${sql.literal(distributionLabel('d'))} AS distribution
        FROM profile p
        JOIN game_edition ej ON ej.id = p.edition_id
        JOIN layer_version vc ON vc.id = p.layer_version_id
        JOIN distribution d ON d.id = p.distribution_id
        WHERE p.review_status = 'aprobado'
        ORDER BY p.id`,
    )
    return games.map((game) => {
      const approved = outcomes.filter((r) => r.game_id === game.id).map((r) => r.outcome)
      const evaluated = profiles.filter((p) => p.game_id === game.id).map((p) => ({ ...p, evaluation: evaluate(machine, requirements(p)) }))
      const profile = suggestProfile(evaluated, setup)
      return {
        game_id: game.id,
        title: game.title,
        in_library: inLibrary.has(game.id),
        status: statusOf(approved),
        test_count: approved.length,
        x86_level_min: game.x86_level_min,
        path: gamePath(machine, setup.x86_level, game),
        profile:
          profile === null
            ? null
            : { id: profile.id, title: profile.title, revision: profile.revision, layer: profile.layer, distribution: profile.distribution, evaluation: profile.evaluation },
      }
    })
  })

export type MatrixRow = Effect.Success<ReturnType<typeof matrix>>[number]

const SteamEdition = Schema.Struct({ app_id: Schema.String, game_id: Game.fields.id })

const splitLibrary = (games: SteamLibrary) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const editions =
      games.length === 0
        ? []
        : yield* rows(
            SteamEdition,
            sql`
              SELECT ej.external_id AS app_id, ej.game_id FROM game_edition ej JOIN launcher l ON l.id = ej.launcher_id
              WHERE l.name = ${STEAM_LAUNCHER} AND ej.external_id IN ${sql.in(games.map((j) => String(j.app_id)))}`,
          )
    const known = new Set(editions.map((e) => e.app_id))
    return {
      inCatalog: new Set(editions.map((e) => e.game_id)),
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
      sql`SELECT id FROM adoption_guide WHERE type = 'eleccion_distribucion' AND status = 'publicada' ORDER BY id LIMIT 1`,
    )
    return {
      matrix: yield* matrix(machine, setup, split?.inCatalog ?? new Set()),
      library: split?.library ?? null,
      distributions: { guide: guide?.id ?? null, evaluated: screenDistros(machine, setup.architecture) },
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
      capture.operating_system === 'Linux'
        ? yield* rows(
            Schema.Struct({ id: Distribution.fields.id }),
            sql`SELECT id FROM distribution WHERE name = ${capture.distribution.name} AND version = ${capture.distribution.version}`,
          )
        : []
    const machine = machineOnLinux(capture)
    const setup = { distribution_id: distribution?.id ?? null, architecture: capture.architecture, x86_level: capture.x86_level }
    return { capture, machine, ...(yield* evaluateMachine(machine, setup, capture.steam_library)) }
  })

const SavedDiagnostic = Schema.Struct({
  ...Diagnostic.fields,
  alias: Machine.fields.alias,
  distribution: Schema.NullOr(Schema.Struct({ name: Distribution.fields.name, version: Distribution.fields.version })),
})

const savedCapture = (d: typeof SavedDiagnostic.Type): Effect.Effect<Capture> => {
  const common = {
    captured_at: d.captured_at,
    os_version: d.os_version,
    architecture: d.architecture,
    cpu_model: d.cpu_model,
    gpu_model: d.gpu_model,
    ram_mb: d.ram_mb,
    vram_mb: d.vram_mb,
    x86_level: d.x86_level,
    secure_boot: d.secure_boot,
    tpm: d.tpm,
    zram_mb: d.zram_mb,
    swap_mb: d.swap_mb,
    gpu_pci_id: d.gpu_pci_id,
    steam_library: d.steam_library,
  }
  if (d.operating_system === 'Windows') return Effect.succeed({ ...common, operating_system: 'Windows' })
  if (d.distribution === null) return Effect.die(`diagnostic ${d.id}: Linux without a distribution`)
  return Effect.succeed({
    ...common,
    operating_system: 'Linux',
    distribution: d.distribution,
    driver: d.driver,
    driver_version: d.driver_version,
    vulkan_support: d.vulkan_support,
    vulkan_version: d.vulkan_version,
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
               CASE WHEN dist.id IS NULL THEN NULL ELSE json_build_object('nombre', dist.name, 'version', dist.version) END AS distribution
        FROM diagnostic d
        JOIN machine e ON e.id = d.machine_id
        LEFT JOIN distribution dist ON dist.id = d.distribution_id
        WHERE d.id = ${id} AND e.user_id = ${user.id}`,
    )
    if (d === undefined) return yield* Effect.fail(new NotFound())
    const machine = machineOnLinux(d)
    return { id: d.id, alias: d.alias, capture: yield* savedCapture(d), machine, ...(yield* evaluateMachine(machine, d, d.steam_library)) }
  })

const MachineRow = Schema.Struct({ id: Machine.fields.id, alias: Machine.fields.alias })
const CaptureSummary = Schema.Struct({
  id: Diagnostic.fields.id,
  machine_id: Diagnostic.fields.machine_id,
  captured_at: Diagnostic.fields.captured_at,
  operating_system: Diagnostic.fields.operating_system,
  gpu_model: Diagnostic.fields.gpu_model,
  ram_mb: Diagnostic.fields.ram_mb,
  distribution: Schema.NullOr(Schema.String),
})

export const myMachines = () =>
  Effect.gen(function* () {
    const visitor = yield* Visitor
    if (Option.isNone(visitor)) return []
    const sql = yield* SqlClient.SqlClient
    const machines = yield* rows(
      MachineRow,
      sql`SELECT id, alias FROM machine WHERE user_id = ${visitor.value.id} ORDER BY created_at, id`,
    )
    const captures = yield* rows(
      CaptureSummary,
      sql`
        SELECT d.id, d.machine_id, d.captured_at, d.operating_system, d.gpu_model, d.ram_mb, ${sql.literal(distributionLabel('dist'))} AS distribution
        FROM diagnostic d
        JOIN machine e ON e.id = d.machine_id
        LEFT JOIN distribution dist ON dist.id = d.distribution_id
        WHERE e.user_id = ${visitor.value.id}
        ORDER BY d.captured_at DESC, d.id DESC`,
    )
    return machines.map((e) => ({ ...e, diagnostics: captures.filter((c) => c.machine_id === e.id) }))
  })
