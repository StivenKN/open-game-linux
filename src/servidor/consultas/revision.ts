import { Effect, Schema, Struct } from 'effect'
import { SqlClient } from 'effect/sql'
import { DistribucionId } from '../../dominio/ids.ts'
import { ResultadoFuncional } from '../../dominio/literales.ts'
import { type AporteRef, type Bloqueo, estadosVigentes, type TipoAporte } from '../../dominio/revision.ts'
import { Diagnostico, Juego, Lanzador, PerfilConfiguracion, Reporte, Solucion, TipoFallo, Usuario } from '../../dominio/tablas.ts'
import { bloqueosAprobacion } from '../aportes/revision.ts'
import { exigirRevisor } from '../auth.ts'
import { filas } from '../filas.ts'
import { esDemo, etiquetaCapa, etiquetaDistribucion, etiquetaPerfil } from './etiquetas.ts'

const Nombre = Schema.String

const Comun = {
  creado_en: Schema.Date,
  estado_revision: PerfilConfiguracion.fields.estado_revision,
  autor: Usuario.fields.alias,
  demo: Schema.Boolean,
  es_propio: Schema.Boolean,
  juego: Juego.fields.titulo,
  lanzador: Lanzador.fields.nombre,
}

const ColaPerfil = Schema.Struct({
  ...Comun,
  ...PerfilConfiguracion.mapFields(Struct.pick(['id', 'titulo', 'revision', 'arquitectura', 'version_juego_objetivo', 'parametros_lanzamiento'])).fields,
  distribucion: Nombre,
  capa: Nombre,
  pasos: Schema.Int,
  reportes_funcionales: Schema.Int,
})

const ColaReporte = Schema.Struct({
  ...Comun,
  ...Reporte.mapFields(
    Struct.pick(['id', 'resultado', 'version_juego', 'fecha_prueba', 'fps_promedio', 'resolucion', 'calidad_grafica', 'metodo_medicion', 'observaciones']),
  ).fields,
  distribucion: Nombre,
  distribucion_id: DistribucionId,
  arquitectura: Diagnostico.fields.arquitectura,
  capa: Nombre,
  perfil: Schema.NullOr(Nombre),
  fallos: Schema.Array(Schema.Struct({ codigo: TipoFallo.fields.codigo, detalle: Schema.String })),
})

const ColaSolucion = Schema.Struct({
  ...Comun,
  ...Solucion.mapFields(Struct.pick(['id', 'titulo', 'instrucciones', 'reporte_id'])).fields,
  tipo_fallo: TipoFallo.fields.codigo,
  fallo: Schema.String,
  estado_reporte: Reporte.fields.estado_revision,
  perfil: Schema.NullOr(Nombre),
})

const conBloqueos = <A extends { readonly estado_revision: string }>(elementos: ReadonlyArray<A>, refDe: (a: A) => AporteRef) =>
  Effect.forEach(elementos, (e) =>
    Effect.map(e.estado_revision === 'pendiente' ? bloqueosAprobacion(refDe(e)) : Effect.succeed([]), (bloqueos: ReadonlyArray<Bloqueo>) => ({ ...e, bloqueos })),
  )

export const cola = (tipo: TipoAporte) =>
  Effect.gen(function* () {
    const revisor = yield* exigirRevisor
    const sql = yield* SqlClient.SqlClient
    const vigentes = sql.in(estadosVigentes)
    const demo = sql.literal(esDemo('u'))
    const orden = sql`(estado_revision = 'pendiente') DESC, creado_en`

    switch (tipo) {
      case 'perfil': {
        const elementos = yield* filas(
          ColaPerfil,
          sql`SELECT * FROM (
                SELECT p.id, p.titulo, p.revision, p.arquitectura, p.version_juego_objetivo, p.parametros_lanzamiento, p.creado_en, p.estado_revision,
                       u.alias AS autor, ${demo} AS demo, p.autor_id = ${revisor.id} AS es_propio,
                       j.titulo AS juego, l.nombre AS lanzador, ${sql.literal(etiquetaDistribucion('di'))} AS distribucion,
                       ${sql.literal(etiquetaCapa('c'))} AS capa,
                       (SELECT count(*)::int FROM paso_configuracion WHERE perfil_id = p.id) AS pasos,
                       (SELECT count(*)::int FROM reporte r WHERE r.perfil_id = p.id AND r.estado_revision = 'aprobado'
                          AND r.resultado IN ${sql.in(ResultadoFuncional.literals)}) AS reportes_funcionales
                FROM perfil_configuracion p JOIN usuario u ON u.id = p.autor_id
                  JOIN edicion_juego e ON e.id = p.edicion_id JOIN juego j ON j.id = e.juego_id JOIN lanzador l ON l.id = e.lanzador_id
                  JOIN distribucion di ON di.id = p.distribucion_id JOIN version_capa c ON c.id = p.version_capa_id
                WHERE p.estado_revision IN ${vigentes}) q
              ORDER BY ${orden}`,
        )
        return { tipo, elementos: yield* conBloqueos(elementos, (e) => ({ _tag: 'perfil', id: e.id })) }
      }
      case 'reporte': {
        const elementos = yield* filas(
          ColaReporte,
          sql`SELECT * FROM (
                SELECT r.id, r.resultado, r.version_juego, r.fecha_prueba, r.fps_promedio, r.resolucion, r.calidad_grafica, r.metodo_medicion,
                       r.observaciones, r.creado_en, r.estado_revision,
                       u.alias AS autor, ${demo} AS demo, eq.usuario_id = ${revisor.id} AS es_propio,
                       j.titulo AS juego, l.nombre AS lanzador, ${sql.literal(etiquetaDistribucion('di'))} AS distribucion, d.distribucion_id, d.arquitectura,
                       ${sql.literal(etiquetaCapa('c'))} AS capa,
                       ${sql.literal(etiquetaPerfil('p'))} AS perfil,
                       COALESCE((SELECT json_agg(json_build_object('codigo', t.codigo, 'detalle', f.detalle) ORDER BY t.id)
                                 FROM reporte_fallo f JOIN tipo_fallo t ON t.id = f.tipo_fallo_id WHERE f.reporte_id = r.id), '[]') AS fallos
                FROM reporte r JOIN diagnostico d ON d.id = r.diagnostico_id JOIN equipo eq ON eq.id = d.equipo_id JOIN usuario u ON u.id = eq.usuario_id
                  JOIN edicion_juego e ON e.id = r.edicion_id JOIN juego j ON j.id = e.juego_id JOIN lanzador l ON l.id = e.lanzador_id
                  JOIN distribucion di ON di.id = d.distribucion_id JOIN version_capa c ON c.id = r.version_capa_id
                  LEFT JOIN perfil_configuracion p ON p.id = r.perfil_id
                WHERE r.estado_revision IN ${vigentes}) q
              ORDER BY ${orden}`,
        )
        return { tipo, elementos: yield* conBloqueos(elementos, (e) => ({ _tag: 'reporte', id: e.id })) }
      }
      case 'solucion': {
        const elementos = yield* filas(
          ColaSolucion,
          sql`SELECT * FROM (
                SELECT s.id, s.titulo, s.instrucciones, s.reporte_id, s.creado_en, s.estado_revision,
                       u.alias AS autor, ${demo} AS demo, s.autor_id = ${revisor.id} AS es_propio,
                       j.titulo AS juego, l.nombre AS lanzador, t.codigo AS tipo_fallo, f.detalle AS fallo, r.estado_revision AS estado_reporte,
                       ${sql.literal(etiquetaPerfil('p'))} || ' (' || p.estado_revision || ')' AS perfil
                FROM solucion s JOIN usuario u ON u.id = s.autor_id
                  JOIN reporte_fallo f ON f.reporte_id = s.reporte_id AND f.tipo_fallo_id = s.tipo_fallo_id JOIN tipo_fallo t ON t.id = s.tipo_fallo_id
                  JOIN reporte r ON r.id = s.reporte_id JOIN edicion_juego e ON e.id = r.edicion_id
                  JOIN juego j ON j.id = e.juego_id JOIN lanzador l ON l.id = e.lanzador_id
                  LEFT JOIN perfil_configuracion p ON p.id = s.perfil_id
                WHERE s.estado_revision IN ${vigentes}) q
              ORDER BY ${orden}`,
        )
        return { tipo, elementos: yield* conBloqueos(elementos, (e) => ({ _tag: 'solucion', id: e.id })) }
      }
    }
  })
