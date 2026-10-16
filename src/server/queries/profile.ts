import { Effect, Option, Schema, Struct } from 'effect'
import { SqlClient, SqlSchema } from 'effect/sql'
import { requirements, evaluate } from '../../domain/evaluation.ts'
import { NotFound } from '../../domain/errors.ts'
import { ProfileId } from '../../domain/ids.ts'
import { ReviewStatus, activeStatuses } from '../../domain/review.ts'
import { LayerFamily } from '../../domain/literals.ts'
import { Dependency, GameEdition, Game, ProfileStep, Profile, ProfileDependency } from '../../domain/tables.ts'
import { exportFix, PrNumber } from '../../domain/upstream.ts'
import { machineOnLinux } from '../gpu/capability.ts'
import { isDemo, layerLabel, distributionLabel } from './labels.ts'
import { visitorDiagnostic } from './game.ts'

const ProfileRow = Profile.mapFields(
  Struct.pick([
    'id',
    'titulo',
    'revision',
    'revisado_en',
    'arquitectura',
    'version_juego_objetivo',
    'ram_min_mb',
    'vram_min_mb',
    'requiere_vulkan',
    'version_vulkan_min',
    'condicion_cpu',
    'condicion_gpu',
    'parametros_lanzamiento',
  ]),
).mapFields(
  Struct.assign({
    estado_revision: ReviewStatus.pick(activeStatuses),
    juego_id: Game.fields.id,
    juego: Game.fields.titulo,
    lanzador: Schema.String,
    identificador_externo: GameEdition.fields.identificador_externo,
    familia: LayerFamily,
    distribucion: Schema.String,
    capa: Schema.String,
    autor: Schema.String,
    ejemplo: Schema.Boolean,
  }),
)

const FixRow = Schema.Struct({ pr: PrNumber, registrado_en: Schema.Date })

const StepRow = ProfileStep.mapFields(Struct.pick(['orden', 'titulo', 'instruccion']))

const DependencyRow = ProfileDependency.mapFields(Struct.pick(['version_requerida', 'obligatoria', 'instruccion_instalacion'])).mapFields(
  Struct.assign(Struct.pick(Dependency.fields, ['nombre', 'gestor', 'descripcion'])),
)

export const profile = (id: ProfileId) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const row = yield* SqlSchema.findOneOption({
      Request: ProfileId,
      Result: ProfileRow,
      execute: (id) => sql`
        SELECT p.id, p.title, p.revision, p.reviewed_at, p.architecture, p.target_game_version, p.ram_min_mb, p.vram_min_mb,
               p.requires_vulkan, p.vulkan_version_min, p.cpu_requirement, p.gpu_requirement, p.launch_options, p.review_status,
               j.id AS game_id, j.title AS game, l.name AS launcher, e.external_id, vc.family,
               ${sql.literal(distributionLabel('dist'))} AS distribution, ${sql.literal(layerLabel('vc'))} AS layer,
               u.alias AS author, ${sql.literal(isDemo('u'))} AS demo
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
      p.estado_revision === 'pendiente'
        ? ('perfil_en_prueba' as const)
        : Option.match(yield* visitorDiagnostic, {
            onNone: () => 'sin_diagnostico' as const,
            onSome: (d) => evaluate(machineOnLinux(d), requirements(p)),
          })

    const fixExport = p.estado_revision === 'aprobado' ? exportFix({ ...p, profile: { id: p.id, revision: p.revision }, dependencies }) : null
    const fixes = yield* SqlSchema.findAll({
      Request: ProfileId,
      Result: FixRow,
      execute: (id) => sql`SELECT pr, noted_at FROM upstream_fix WHERE profile_id = ${id} ORDER BY noted_at, pr`,
    })(id)

    return { profile: p, steps, dependencies, evaluation, fixExport, fixes }
  })
