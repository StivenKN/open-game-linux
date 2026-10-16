import { Effect, Schema, Struct } from 'effect'
import { SqlClient } from 'effect/sql'
import { NotFound } from '../../domain/errors.ts'
import type { ReportId } from '../../domain/ids.ts'
import { activeStatuses } from '../../domain/review.ts'
import { Diagnostic, GameEdition, Game, Launcher, Report, ReportFailure, LayerVersion } from '../../domain/tables.ts'
import { protonReport } from '../../domain/upstream.ts'
import { requireUser } from '../auth.ts'
import { rows } from '../rows.ts'
import { isDemo, distributionLabel } from './labels.ts'

const ProtonReportRow = Schema.Struct({
  juego_id: Game.fields.id,
  juego: Game.fields.titulo,
  lanzador: Launcher.fields.nombre,
  identificador_externo: GameEdition.fields.identificador_externo,
  ...LayerVersion.mapFields(Struct.pick(['familia', 'variante', 'version'])).fields,
  ...Report.mapFields(Struct.pick(['resultado', 'version_juego', 'fecha_prueba', 'observaciones'])).fields,
  ...Diagnostic.mapFields(Struct.pick(['gpu_modelo', 'controlador', 'version_controlador', 'version_sistema'])).fields,
  distribucion: Schema.String,
  ejemplo: Schema.Boolean,
})
const FailureRow = ReportFailure.mapFields(Struct.pick(['detalle']))

/**
 * The Proton report for one of the visitor's own reports. It embeds the diagnosis hardware, which only its
 * owner sees, and needs the steam-<appid>.log that only the tester has, so anyone else gets NoEncontrado.
 */
export const myProtonReport = (reportId: ReportId) =>
  Effect.gen(function* () {
    const user = yield* requireUser
    const sql = yield* SqlClient.SqlClient
    const [row] = yield* rows(
      ProtonReportRow,
      sql`SELECT j.id AS juego_id, j.titulo AS juego, l.nombre AS lanzador, e.identificador_externo,
                 vc.familia, vc.variante, vc.version, r.resultado, r.version_juego, r.fecha_prueba, r.observaciones,
                 d.gpu_modelo, d.controlador, d.version_controlador, d.version_sistema,
                 ${sql.literal(distributionLabel('di'))} AS distribucion, ${sql.literal(isDemo('u'))} AS ejemplo
          FROM reporte r
          JOIN edicion_juego e ON e.id = r.edicion_id
          JOIN juego j ON j.id = e.juego_id
          JOIN lanzador l ON l.id = e.lanzador_id
          JOIN version_capa vc ON vc.id = r.version_capa_id
          JOIN diagnostico d ON d.id = r.diagnostico_id
          JOIN distribucion di ON di.id = d.distribucion_id
          JOIN equipo eq ON eq.id = d.equipo_id
          JOIN usuario u ON u.id = eq.usuario_id
          WHERE r.id = ${reportId} AND eq.usuario_id = ${user.id} AND r.estado_revision IN ${sql.in(activeStatuses)}`,
    )
    if (row === undefined) return yield* Effect.fail(new NotFound())
    const failures = yield* rows(FailureRow, sql`SELECT detalle FROM reporte_fallo WHERE reporte_id = ${reportId} ORDER BY tipo_fallo_id`)
    return {
      report: { id: reportId, juego_id: row.juego_id, juego: row.juego },
      protonReport: protonReport({ ...row, failures: failures.map((f) => f.detalle) }),
    }
  })
