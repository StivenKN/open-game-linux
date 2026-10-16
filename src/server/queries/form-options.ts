import { Effect, Schema, Struct } from 'effect'
import { SqlClient } from 'effect/sql'
import { TargetProfile } from '../../domain/contributions.ts'
import { NotFound } from '../../domain/errors.ts'
import { DiagnosticId, DistributionId, EditionId, type GameId, type ProfileId, type ReportId } from '../../domain/ids.ts'
import { activeStatuses } from '../../domain/review.ts'
import { Diagnostic, Machine, Game, Launcher, Profile, Report, FailureType, LayerVersion } from '../../domain/tables.ts'
import { exigirRevisor, exigirUsuario } from '../auth.ts'
import { filas } from '../rows.ts'
import { etiquetaCapa, etiquetaDistribucion } from './labels.ts'

const JuegoFila = Game.mapFields(Struct.pick(['id', 'titulo']))
const EdicionFila = Schema.Struct({ id: EditionId, lanzador: Launcher.fields.nombre })
const Nombre = Schema.String

const DiagnosticoFila = Schema.Struct({
  id: DiagnosticId,
  equipo: Machine.fields.alias,
  distribucion: Nombre,
  distribucion_id: DistributionId,
  ...Diagnostic.mapFields(Struct.pick(['arquitectura', 'capturado_en'])).fields,
})

const PerfilFila = Schema.Struct({
  ...Profile.mapFields(Struct.pick(['id', 'titulo', 'revision', 'estado_revision'])).fields,
  ...TargetProfile.fields,
  distribucion: Nombre,
})

export const opcionesReporte = (juegoId: GameId, perfil: ProfileId | null) =>
  Effect.gen(function* () {
    const usuario = yield* exigirUsuario
    const sql = yield* SqlClient.SqlClient
    const [juego] = yield* filas(JuegoFila, sql`SELECT id, titulo FROM juego WHERE id = ${juegoId}`)
    if (juego === undefined) return yield* Effect.fail(new NotFound())

    const ediciones = yield* filas(
      EdicionFila,
      sql`SELECT e.id, l.nombre AS lanzador FROM edicion_juego e JOIN lanzador l ON l.id = e.lanzador_id
          WHERE e.juego_id = ${juegoId} ORDER BY l.nombre`,
    )
    const diagnosticos = yield* filas(
      DiagnosticoFila,
      sql`SELECT d.id, eq.alias AS equipo, ${sql.literal(etiquetaDistribucion('di'))} AS distribucion, d.distribucion_id, d.arquitectura, d.capturado_en
          FROM diagnostico d JOIN equipo eq ON eq.id = d.equipo_id JOIN distribucion di ON di.id = d.distribucion_id
          WHERE eq.usuario_id = ${usuario.id} ORDER BY d.capturado_en DESC`,
    )
    const capas = yield* filas(LayerVersion, sql`SELECT id, familia, variante, version FROM version_capa ORDER BY familia, variante, version`)
    const perfiles = yield* filas(
      PerfilFila,
      sql`SELECT p.id, p.titulo, p.revision, p.estado_revision, p.edicion_id, p.version_capa_id, p.distribucion_id, p.arquitectura,
                 p.version_juego_objetivo, ${sql.literal(etiquetaDistribucion('di'))} AS distribucion
          FROM perfil_configuracion p JOIN edicion_juego e ON e.id = p.edicion_id JOIN distribucion di ON di.id = p.distribucion_id
          WHERE e.juego_id = ${juegoId} AND p.estado_revision IN ${sql.in(activeStatuses)} ORDER BY p.titulo, p.revision`,
    )
    const tiposFallo = yield* filas(FailureType, sql`SELECT id, codigo, descripcion FROM tipo_fallo ORDER BY id`)
    return { juego, ediciones, diagnosticos, capas, perfiles, tiposFallo, perfilElegido: perfiles.find((p) => p.id === perfil)?.id ?? null }
  })

const ReporteOrigen = Schema.Struct({
  ...Report.mapFields(Struct.pick(['id', 'edicion_id', 'resultado', 'version_juego', 'fecha_prueba', 'observaciones', 'estado_revision'])).fields,
  juego_id: Game.fields.id,
  juego: Game.fields.titulo,
  lanzador: Launcher.fields.nombre,
  distribucion: Nombre,
  capa: Nombre,
})
const FalloOrigen = Schema.Struct({ tipo_fallo_id: FailureType.fields.id, codigo: FailureType.fields.codigo, detalle: Schema.String })
const PerfilEdicion = Profile.mapFields(Struct.pick(['id', 'titulo', 'revision', 'estado_revision']))

export const opcionesSolucion = (reporteId: ReportId) =>
  Effect.gen(function* () {
    yield* exigirUsuario
    const sql = yield* SqlClient.SqlClient
    const [reporte] = yield* filas(
      ReporteOrigen,
      sql`SELECT r.id, r.edicion_id, r.resultado, r.version_juego, r.fecha_prueba, r.observaciones, r.estado_revision,
                 j.id AS juego_id, j.titulo AS juego, l.nombre AS lanzador, ${sql.literal(etiquetaDistribucion('di'))} AS distribucion,
                 ${sql.literal(etiquetaCapa('c'))} AS capa
          FROM reporte r JOIN edicion_juego e ON e.id = r.edicion_id JOIN juego j ON j.id = e.juego_id JOIN lanzador l ON l.id = e.lanzador_id
            JOIN diagnostico d ON d.id = r.diagnostico_id JOIN distribucion di ON di.id = d.distribucion_id
            JOIN version_capa c ON c.id = r.version_capa_id
          WHERE r.id = ${reporteId} AND r.estado_revision IN ${sql.in(activeStatuses)}`,
    )
    if (reporte === undefined) return yield* Effect.fail(new NotFound())
    const fallos = yield* filas(
      FalloOrigen,
      sql`SELECT f.tipo_fallo_id, t.codigo, f.detalle FROM reporte_fallo f JOIN tipo_fallo t ON t.id = f.tipo_fallo_id
          WHERE f.reporte_id = ${reporteId} ORDER BY t.id`,
    )
    if (fallos.length === 0) return yield* Effect.fail(new NotFound())
    const perfiles = yield* filas(
      PerfilEdicion,
      sql`SELECT id, titulo, revision, estado_revision FROM perfil_configuracion
          WHERE edicion_id = ${reporte.edicion_id} AND estado_revision IN ${sql.in(activeStatuses)} ORDER BY titulo, revision`,
    )
    return { reporte, fallos, perfiles }
  })

const LanzadorFila = Launcher.mapFields(Struct.pick(['id', 'nombre']))

export const opcionesJuego = Effect.gen(function* () {
  yield* exigirRevisor
  const sql = yield* SqlClient.SqlClient
  return { lanzadores: yield* filas(LanzadorFila, sql`SELECT id, nombre FROM lanzador ORDER BY nombre`) }
})
