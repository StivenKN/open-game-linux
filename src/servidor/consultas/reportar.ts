// Read models behind the two contribution forms (RF-08): what a signed-in user may report on, and what a
// solution may answer. Writes and their rules live in servidor/aportes/aportes.ts.
import { Effect, Schema, Struct } from 'effect'
import { SqlClient } from 'effect/sql'
import { PerfilObjetivo } from '../../dominio/aportes.ts'
import { NoEncontrado } from '../../dominio/fallos.ts'
import { DiagnosticoId, EdicionId, type JuegoId, type PerfilId, type ReporteId } from '../../dominio/ids.ts'
import { estadosVigentes } from '../../dominio/revision.ts'
import { Diagnostico, Equipo, Juego, Lanzador, PerfilConfiguracion, Reporte, TipoFallo, VersionCapa } from '../../dominio/tablas.ts'
import { exigirUsuario } from '../auth.ts'
import { filas } from '../filas.ts'

const JuegoFila = Juego.mapFields(Struct.pick(['id', 'titulo']))
const EdicionFila = Schema.Struct({ id: EdicionId, lanzador: Lanzador.fields.nombre })
const Nombre = Schema.String // "Linux Mint 21.3", "Proton Valve 8.0-5": composed in SQL for display only

const DiagnosticoFila = Schema.Struct({
  id: DiagnosticoId,
  equipo: Equipo.fields.alias,
  distribucion: Nombre,
  ...Diagnostico.mapFields(Struct.pick(['distribucion_id', 'arquitectura', 'capturado_en'])).fields,
})

const PerfilFila = Schema.Struct({
  ...PerfilConfiguracion.mapFields(Struct.pick(['id', 'titulo', 'revision', 'estado_revision'])).fields,
  ...PerfilObjetivo.fields,
  distribucion: Nombre,
})

/**
 * The report form for one game. Profiles are every pending or approved profile of the game's
 * editions; the form keeps only those `discrepancias` finds comparable with the diagnosis, edition,
 * layer and version the user picks (the pure rule runs in the browser too). `?perfil=` preselects one
 * when it is among them, comparable or not, so the user sees why it does not fit.
 */
export const opcionesReporte = (juegoId: JuegoId, perfil: PerfilId | null) =>
  Effect.gen(function* () {
    const usuario = yield* exigirUsuario
    const sql = yield* SqlClient.SqlClient
    const [juego] = yield* filas(JuegoFila, sql`SELECT id, titulo FROM juego WHERE id = ${juegoId}`)
    if (juego === undefined) return yield* Effect.fail(new NoEncontrado())

    const ediciones = yield* filas(
      EdicionFila,
      sql`SELECT e.id, l.nombre AS lanzador FROM edicion_juego e JOIN lanzador l ON l.id = e.lanzador_id
          WHERE e.juego_id = ${juegoId} ORDER BY l.nombre`,
    )
    // Only Linux captures can back a report (8.7); a Windows one only orients.
    const diagnosticos = yield* filas(
      DiagnosticoFila,
      sql`SELECT d.id, eq.alias AS equipo, di.nombre || ' ' || di.version AS distribucion, d.distribucion_id, d.arquitectura, d.capturado_en
          FROM diagnostico d JOIN equipo eq ON eq.id = d.equipo_id JOIN distribucion di ON di.id = d.distribucion_id
          WHERE eq.usuario_id = ${usuario.id} ORDER BY d.capturado_en DESC`,
    )
    const capas = yield* filas(VersionCapa, sql`SELECT id, familia, variante, version FROM version_capa ORDER BY familia, variante, version`)
    const perfiles = yield* filas(
      PerfilFila,
      sql`SELECT p.id, p.titulo, p.revision, p.estado_revision, p.edicion_id, p.version_capa_id, p.distribucion_id, p.arquitectura,
                 p.version_juego_objetivo, di.nombre || ' ' || di.version AS distribucion
          FROM perfil_configuracion p JOIN edicion_juego e ON e.id = p.edicion_id JOIN distribucion di ON di.id = p.distribucion_id
          WHERE e.juego_id = ${juegoId} AND p.estado_revision IN ${sql.in(estadosVigentes)} ORDER BY p.titulo, p.revision`,
    )
    const tiposFallo = yield* filas(TipoFallo, sql`SELECT id, codigo, descripcion FROM tipo_fallo ORDER BY id`)
    return { juego, ediciones, diagnosticos, capas, perfiles, tiposFallo, perfilElegido: perfiles.find((p) => p.id === perfil)?.id ?? null }
  })

const ReporteOrigen = Schema.Struct({
  ...Reporte.mapFields(Struct.pick(['id', 'edicion_id', 'resultado', 'version_juego', 'fecha_prueba', 'observaciones', 'estado_revision'])).fields,
  juego_id: Juego.fields.id,
  juego: Juego.fields.titulo,
  lanzador: Lanzador.fields.nombre,
  distribucion: Nombre,
  capa: Nombre,
})
const FalloOrigen = Schema.Struct({ tipo_fallo_id: TipoFallo.fields.id, codigo: TipoFallo.fields.codigo, detalle: Schema.String })
const PerfilEdicion = PerfilConfiguracion.mapFields(Struct.pick(['id', 'titulo', 'revision', 'estado_revision']))

/**
 * The solution form for one public report. A report with no fallo has nothing to solve, so it is
 * notFound like a missing one. Recommendable profiles are the pending and approved ones of the
 * report's edition (8.8); approving the solution later needs the profile approved too (8.9).
 */
export const opcionesSolucion = (reporteId: ReporteId) =>
  Effect.gen(function* () {
    yield* exigirUsuario
    const sql = yield* SqlClient.SqlClient
    const [reporte] = yield* filas(
      ReporteOrigen,
      sql`SELECT r.id, r.edicion_id, r.resultado, r.version_juego, r.fecha_prueba, r.observaciones, r.estado_revision,
                 j.id AS juego_id, j.titulo AS juego, l.nombre AS lanzador, di.nombre || ' ' || di.version AS distribucion,
                 c.familia || ' ' || c.variante || ' ' || c.version AS capa
          FROM reporte r JOIN edicion_juego e ON e.id = r.edicion_id JOIN juego j ON j.id = e.juego_id JOIN lanzador l ON l.id = e.lanzador_id
            JOIN diagnostico d ON d.id = r.diagnostico_id JOIN distribucion di ON di.id = d.distribucion_id
            JOIN version_capa c ON c.id = r.version_capa_id
          WHERE r.id = ${reporteId} AND r.estado_revision IN ${sql.in(estadosVigentes)}`,
    )
    if (reporte === undefined) return yield* Effect.fail(new NoEncontrado())
    const fallos = yield* filas(
      FalloOrigen,
      sql`SELECT f.tipo_fallo_id, t.codigo, f.detalle FROM reporte_fallo f JOIN tipo_fallo t ON t.id = f.tipo_fallo_id
          WHERE f.reporte_id = ${reporteId} ORDER BY t.id`,
    )
    if (fallos.length === 0) return yield* Effect.fail(new NoEncontrado())
    const perfiles = yield* filas(
      PerfilEdicion,
      sql`SELECT id, titulo, revision, estado_revision FROM perfil_configuracion
          WHERE edicion_id = ${reporte.edicion_id} AND estado_revision IN ${sql.in(estadosVigentes)} ORDER BY titulo, revision`,
    )
    return { reporte, fallos, perfiles }
  })
