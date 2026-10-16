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
        SELECT p.id, p.titulo, p.revision, p.revisado_en, p.arquitectura, p.version_juego_objetivo, p.ram_min_mb, p.vram_min_mb,
               p.requiere_vulkan, p.version_vulkan_min, p.condicion_cpu, p.condicion_gpu, p.parametros_lanzamiento, p.estado_revision,
               j.id AS juego_id, j.titulo AS juego, l.nombre AS lanzador, e.identificador_externo, vc.familia,
               ${sql.literal(distributionLabel('dist'))} AS distribucion, ${sql.literal(layerLabel('vc'))} AS capa,
               u.alias AS autor, ${sql.literal(isDemo('u'))} AS ejemplo
        FROM perfil_configuracion p
        JOIN edicion_juego e ON e.id = p.edicion_id
        JOIN juego j ON j.id = e.juego_id
        JOIN lanzador l ON l.id = e.lanzador_id
        JOIN distribucion dist ON dist.id = p.distribucion_id
        JOIN version_capa vc ON vc.id = p.version_capa_id
        JOIN usuario u ON u.id = p.autor_id
        WHERE p.id = ${id} AND p.estado_revision IN ${sql.in(activeStatuses)}`,
    })(id)
    if (Option.isNone(row)) return yield* new NotFound()
    const p = row.value

    const steps = yield* SqlSchema.findAll({
      Request: ProfileId,
      Result: StepRow,
      execute: (id) => sql`SELECT orden, titulo, instruccion FROM paso_configuracion WHERE perfil_id = ${id} ORDER BY orden`,
    })(id)

    const dependencies = yield* SqlSchema.findAll({
      Request: ProfileId,
      Result: DependencyRow,
      execute: (id) => sql`
        SELECT pd.version_requerida, pd.obligatoria, pd.instruccion_instalacion, d.nombre, d.gestor, d.descripcion
        FROM perfil_dependencia pd JOIN dependencia d ON d.id = pd.dependencia_id
        WHERE pd.perfil_id = ${id}
        ORDER BY pd.obligatoria DESC, d.nombre`,
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
      execute: (id) => sql`SELECT pr, registrado_en FROM arreglo_upstream WHERE perfil_id = ${id} ORDER BY registrado_en, pr`,
    })(id)

    return { profile: p, steps, dependencies, evaluation, fixExport, fixes }
  })
