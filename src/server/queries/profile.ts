import { Effect, Option, Schema, Struct } from 'effect'
import { SqlClient, SqlSchema } from 'effect/sql'
import { requirements, evaluate } from '../../domain/evaluation.ts'
import { NotFound } from '../../domain/errors.ts'
import { ProfileId } from '../../domain/ids.ts'
import { ReviewStatus, activeStatuses } from '../../domain/review.ts'
import { LayerFamily } from '../../domain/literals.ts'
import { Dependency, GameEdition, Game, ProfileStep, Profile, ProfileDependency } from '../../domain/tables.ts'
import { exportFix, PrNumber } from '../../domain/upstream.ts'
import { Visitor } from '../auth.ts'
import { profileEditable } from '../commands/contributions.ts'
import { machineOnLinux } from '../gpu/capability.ts'
import { isDemo, layerLabel, distributionLabel } from './labels.ts'
import { visitorDiagnostic } from './game.ts'

const ProfileRow = Profile.mapFields(
  Struct.pick([
    'id',
    'title',
    'revision',
    'reviewed_at',
    'architecture',
    'target_game_version',
    'ram_min_mb',
    'vram_min_mb',
    'requires_vulkan',
    'vulkan_version_min',
    'cpu_requirement',
    'gpu_requirement',
    'launch_options',
  ]),
).mapFields(
  Struct.assign({
    review_status: ReviewStatus.pick(activeStatuses),
    game_id: Game.fields.id,
    game: Game.fields.title,
    launcher: Schema.String,
    external_id: GameEdition.fields.external_id,
    family: LayerFamily,
    distribution: Schema.String,
    layer: Schema.String,
    author: Schema.String,
    demo: Schema.Boolean,
    // The visitor wrote it and may still change it.
    editable: Schema.Boolean,
  }),
)

const FixRow = Schema.Struct({ pr: PrNumber, noted_at: Schema.Date })

const StepRow = ProfileStep.mapFields(Struct.pick(['position', 'title', 'instruction']))

const DependencyRow = ProfileDependency.mapFields(Struct.pick(['required_version', 'required', 'install_instruction'])).mapFields(
  Struct.assign(Struct.pick(Dependency.fields, ['name', 'package_manager', 'description'])),
)

export const profile = (id: ProfileId) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const visitorId = Option.getOrNull(Option.map(yield* Visitor, (u) => u.id))
    const row = yield* SqlSchema.findOneOption({
      Request: ProfileId,
      Result: ProfileRow,
      execute: (id) => sql`
        SELECT p.id, p.title, p.revision, p.reviewed_at, p.architecture, p.target_game_version, p.ram_min_mb, p.vram_min_mb,
               p.requires_vulkan, p.vulkan_version_min, p.cpu_requirement, p.gpu_requirement, p.launch_options, p.review_status,
               j.id AS game_id, j.title AS game, l.name AS launcher, e.external_id, vc.family,
               ${sql.literal(distributionLabel('dist'))} AS distribution, ${sql.literal(layerLabel('vc'))} AS layer,
               u.alias AS author, ${sql.literal(isDemo('u'))} AS demo,
               p.author_id IS NOT DISTINCT FROM ${visitorId} AND ${sql.literal(profileEditable('p'))} AS editable
        FROM profile p
        JOIN game_edition e ON e.id = p.edition_id
        JOIN game j ON j.id = e.game_id
        JOIN launcher l ON l.id = e.launcher_id
        JOIN distribution dist ON dist.id = p.distribution_id
        JOIN layer_version vc ON vc.id = p.layer_version_id
        JOIN app_user u ON u.id = p.author_id
        WHERE p.id = ${id} AND p.review_status IN ${sql.in(activeStatuses)}`,
    })(id)
    if (Option.isNone(row)) return yield* new NotFound()
    const p = row.value

    const steps = yield* SqlSchema.findAll({
      Request: ProfileId,
      Result: StepRow,
      execute: (id) => sql`SELECT position, title, instruction FROM profile_step WHERE profile_id = ${id} ORDER BY position`,
    })(id)

    const dependencies = yield* SqlSchema.findAll({
      Request: ProfileId,
      Result: DependencyRow,
      execute: (id) => sql`
        SELECT pd.required_version, pd.required, pd.install_instruction, d.name, d.package_manager, d.description
        FROM profile_dependency pd JOIN dependency d ON d.id = pd.dependency_id
        WHERE pd.profile_id = ${id}
        ORDER BY pd.required DESC, d.name`,
    })(id)

    const evaluation =
      p.review_status === 'pendiente'
        ? ('perfil_en_prueba' as const)
        : Option.match(yield* visitorDiagnostic, {
            onNone: () => 'sin_diagnostico' as const,
            onSome: (d) => evaluate(machineOnLinux(d), requirements(p)),
          })

    const fixExport = p.review_status === 'aprobado' ? exportFix({ ...p, profile: { id: p.id, revision: p.revision }, dependencies }) : null
    const fixes = yield* SqlSchema.findAll({
      Request: ProfileId,
      Result: FixRow,
      execute: (id) => sql`SELECT pr, noted_at FROM upstream_fix WHERE profile_id = ${id} ORDER BY noted_at, pr`,
    })(id)

    return { profile: p, steps, dependencies, evaluation, fixExport, fixes }
  })
