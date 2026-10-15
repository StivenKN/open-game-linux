import { Effect, Schema, Struct } from 'effect'
import { SqlClient } from 'effect/sql'
import { NoEncontrado } from '../../dominio/fallos.ts'
import type { ReporteId } from '../../dominio/ids.ts'
import { estadosVigentes } from '../../dominio/revision.ts'
import { Diagnostico, EdicionJuego, Juego, Lanzador, Reporte, ReporteFallo, VersionCapa } from '../../dominio/tablas.ts'
import { informeProton } from '../../dominio/upstream.ts'
import { exigirUsuario } from '../auth.ts'
import { filas } from '../filas.ts'
import { esDemo, etiquetaDistribucion } from './etiquetas.ts'

const FilaInforme = Schema.Struct({
  juego_id: Juego.fields.id,
  juego: Juego.fields.titulo,
  lanzador: Lanzador.fields.nombre,
  identificador_externo: EdicionJuego.fields.identificador_externo,
  ...VersionCapa.mapFields(Struct.pick(['familia', 'variante', 'version'])).fields,
  ...Reporte.mapFields(Struct.pick(['resultado', 'version_juego', 'fecha_prueba', 'observaciones'])).fields,
  ...Diagnostico.mapFields(Struct.pick(['gpu_modelo', 'controlador', 'version_controlador', 'version_sistema'])).fields,
  distribucion: Schema.String,
  ejemplo: Schema.Boolean,
})
const FilaFallo = ReporteFallo.mapFields(Struct.pick(['detalle']))

/**
 * The Proton report for one of the visitor's own reports. It embeds the diagnosis hardware, which only its
 * owner sees, and needs the steam-<appid>.log that only the tester has, so anyone else gets NoEncontrado.
 */
export const informeProtonDe = (reporteId: ReporteId) =>
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
          WHERE r.id = ${reporteId} AND eq.usuario_id = ${usuario.id} AND r.estado_revision IN ${sql.in(estadosVigentes)}`,
    )
    if (fila === undefined) return yield* Effect.fail(new NoEncontrado())
    const fallos = yield* filas(FilaFallo, sql`SELECT detalle FROM reporte_fallo WHERE reporte_id = ${reporteId} ORDER BY tipo_fallo_id`)
    return {
      reporte: { id: reporteId, juego_id: fila.juego_id, juego: fila.juego },
      informe: informeProton({ ...fila, fallos: fallos.map((f) => f.detalle) }),
    }
  })
