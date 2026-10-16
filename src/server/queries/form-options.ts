import { Effect, Schema, Struct } from 'effect'
import { SqlClient } from 'effect/sql'
import { TargetProfile } from '../../domain/contributions.ts'
import { NotFound } from '../../domain/errors.ts'
import { DiagnosticId, DistributionId, EditionId, type GameId, type ProfileId, type ReportId } from '../../domain/ids.ts'
import { activeStatuses } from '../../domain/review.ts'
import { Diagnostic, Machine, Game, Launcher, Profile, Report, FailureType, LayerVersion } from '../../domain/tables.ts'
import { requireReviewer, requireUser } from '../auth.ts'
import { rows } from '../rows.ts'
import { layerLabel, distributionLabel } from './labels.ts'

const GameRow = Game.mapFields(Struct.pick(['id', 'titulo']))
const EditionRow = Schema.Struct({ id: EditionId, lanzador: Launcher.fields.nombre })
const Name = Schema.String

const DiagnosticRow = Schema.Struct({
  id: DiagnosticId,
  equipo: Machine.fields.alias,
  distribucion: Name,
  distribucion_id: DistributionId,
  ...Diagnostic.mapFields(Struct.pick(['arquitectura', 'capturado_en'])).fields,
})

const ProfileRow = Schema.Struct({
  ...Profile.mapFields(Struct.pick(['id', 'titulo', 'revision', 'estado_revision'])).fields,
  ...TargetProfile.fields,
  distribucion: Name,
})

export const reportOptions = (gameId: GameId, profile: ProfileId | null) =>
  Effect.gen(function* () {
    const user = yield* requireUser
    const sql = yield* SqlClient.SqlClient
    const [game] = yield* rows(GameRow, sql`SELECT id, titulo FROM juego WHERE id = ${gameId}`)
    if (game === undefined) return yield* Effect.fail(new NotFound())

    const editions = yield* rows(
      EditionRow,
      sql`SELECT e.id, l.nombre AS lanzador FROM edicion_juego e JOIN lanzador l ON l.id = e.lanzador_id
          WHERE e.juego_id = ${gameId} ORDER BY l.nombre`,
    )
    const diagnostics = yield* rows(
      DiagnosticRow,
      sql`SELECT d.id, eq.alias AS equipo, ${sql.literal(distributionLabel('di'))} AS distribucion, d.distribucion_id, d.arquitectura, d.capturado_en
          FROM diagnostico d JOIN equipo eq ON eq.id = d.equipo_id JOIN distribucion di ON di.id = d.distribucion_id
          WHERE eq.usuario_id = ${user.id} ORDER BY d.capturado_en DESC`,
    )
    const layers = yield* rows(LayerVersion, sql`SELECT id, familia, variante, version FROM version_capa ORDER BY familia, variante, version`)
    const profiles = yield* rows(
      ProfileRow,
      sql`SELECT p.id, p.titulo, p.revision, p.estado_revision, p.edicion_id, p.version_capa_id, p.distribucion_id, p.arquitectura,
                 p.version_juego_objetivo, ${sql.literal(distributionLabel('di'))} AS distribucion
          FROM perfil_configuracion p JOIN edicion_juego e ON e.id = p.edicion_id JOIN distribucion di ON di.id = p.distribucion_id
          WHERE e.juego_id = ${gameId} AND p.estado_revision IN ${sql.in(activeStatuses)} ORDER BY p.titulo, p.revision`,
    )
    const failureTypes = yield* rows(FailureType, sql`SELECT id, codigo, descripcion FROM tipo_fallo ORDER BY id`)
    return { game, editions, diagnostics, layers, profiles, failureTypes, selectedProfile: profiles.find((p) => p.id === profile)?.id ?? null }
  })

const SourceReport = Schema.Struct({
  ...Report.mapFields(Struct.pick(['id', 'edicion_id', 'resultado', 'version_juego', 'fecha_prueba', 'observaciones', 'estado_revision'])).fields,
  juego_id: Game.fields.id,
  juego: Game.fields.titulo,
  lanzador: Launcher.fields.nombre,
  distribucion: Name,
  capa: Name,
})
const SourceFailure = Schema.Struct({ tipo_fallo_id: FailureType.fields.id, codigo: FailureType.fields.codigo, detalle: Schema.String })
const EditionProfile = Profile.mapFields(Struct.pick(['id', 'titulo', 'revision', 'estado_revision']))

export const solutionOptions = (reportId: ReportId) =>
  Effect.gen(function* () {
    yield* requireUser
    const sql = yield* SqlClient.SqlClient
    const [report] = yield* rows(
      SourceReport,
      sql`SELECT r.id, r.edicion_id, r.resultado, r.version_juego, r.fecha_prueba, r.observaciones, r.estado_revision,
                 j.id AS juego_id, j.titulo AS juego, l.nombre AS lanzador, ${sql.literal(distributionLabel('di'))} AS distribucion,
                 ${sql.literal(layerLabel('c'))} AS capa
          FROM reporte r JOIN edicion_juego e ON e.id = r.edicion_id JOIN juego j ON j.id = e.juego_id JOIN lanzador l ON l.id = e.lanzador_id
            JOIN diagnostico d ON d.id = r.diagnostico_id JOIN distribucion di ON di.id = d.distribucion_id
            JOIN version_capa c ON c.id = r.version_capa_id
          WHERE r.id = ${reportId} AND r.estado_revision IN ${sql.in(activeStatuses)}`,
    )
    if (report === undefined) return yield* Effect.fail(new NotFound())
    const failures = yield* rows(
      SourceFailure,
      sql`SELECT f.tipo_fallo_id, t.codigo, f.detalle FROM reporte_fallo f JOIN tipo_fallo t ON t.id = f.tipo_fallo_id
          WHERE f.reporte_id = ${reportId} ORDER BY t.id`,
    )
    if (failures.length === 0) return yield* Effect.fail(new NotFound())
    const profiles = yield* rows(
      EditionProfile,
      sql`SELECT id, titulo, revision, estado_revision FROM perfil_configuracion
          WHERE edicion_id = ${report.edicion_id} AND estado_revision IN ${sql.in(activeStatuses)} ORDER BY titulo, revision`,
    )
    return { report, failures, profiles }
  })

const LauncherRow = Launcher.mapFields(Struct.pick(['id', 'nombre']))

export const gameOptions = Effect.gen(function* () {
  yield* requireReviewer
  const sql = yield* SqlClient.SqlClient
  return { launchers: yield* rows(LauncherRow, sql`SELECT id, nombre FROM lanzador ORDER BY nombre`) }
})
