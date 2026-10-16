import { Effect, Schema, Struct } from 'effect'
import { SqlClient } from 'effect/sql'
import { NotFound } from '../../domain/errors.ts'
import type { ReportId } from '../../domain/ids.ts'
import { activeStatuses } from '../../domain/review.ts'
import { Diagnostic, GameEdition, Game, Launcher, Report, ReportFailure, LayerVersion } from '../../domain/tables.ts'
import { protonReport } from '../../domain/upstream.ts'
import { exigirUsuario } from '../auth.ts'
import { filas } from '../rows.ts'
import { esDemo, etiquetaDistribucion } from './labels.ts'

const FilaInforme = Schema.Struct({
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
const FilaFallo = ReportFailure.mapFields(Struct.pick(['detalle']))

/**
 * The Proton report for one of the visitor's own reports. It embeds the diagnosis hardware, which only its
 * owner sees, and needs the steam-<appid>.log that only the tester has, so anyone else gets NoEncontrado.
 */
export const informeProtonDe = (reporteId: ReportId) =>
  Effect.gen(function* () {
    const usuario = yield* exigirUsuario
    const sql = yield* SqlClient.SqlClient
    const [fila] = yield* filas(
      FilaInforme,
      sql`SELECT j.id AS juego_id, j.titulo AS juego, l.nombre AS lanzador, e.identificador_externo,
                 vc.familia, vc.variante, vc.version, r.resultado, r.version_juego, r.fecha_prueba, r.observaciones,
                 d.gpu_modelo, d.controlador, d.version_controlador, d.version_sistema,
                 ${sql.literal(etiquetaDistribucion('di'))} AS distribucion, ${sql.literal(esDemo('u'))} AS ejemplo
          FROM reporte r
          JOIN edicion_juego e ON e.id = r.edicion_id
          JOIN juego j ON j.id = e.juego_id
          JOIN lanzador l ON l.id = e.lanzador_id
          JOIN version_capa vc ON vc.id = r.version_capa_id
          JOIN diagnostico d ON d.id = r.diagnostico_id
          JOIN distribucion di ON di.id = d.distribucion_id
          JOIN equipo eq ON eq.id = d.equipo_id
          JOIN usuario u ON u.id = eq.usuario_id
          WHERE r.id = ${reporteId} AND eq.usuario_id = ${usuario.id} AND r.estado_revision IN ${sql.in(activeStatuses)}`,
    )
    if (fila === undefined) return yield* Effect.fail(new NotFound())
    const fallos = yield* filas(FilaFallo, sql`SELECT detalle FROM reporte_fallo WHERE reporte_id = ${reporteId} ORDER BY tipo_fallo_id`)
    return {
      reporte: { id: reporteId, juego_id: fila.juego_id, juego: fila.juego },
      informe: protonReport({ ...fila, failures: fallos.map((f) => f.detalle) }),
    }
  })
