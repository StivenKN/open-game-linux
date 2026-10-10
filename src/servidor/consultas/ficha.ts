// Read model of the ficha (wireframe 9.3). Its success type is the page data type, inferred through
// fichaJuegoFn into Route.useLoaderData; nothing declares page props by hand.
import { Effect, Option, Schema, Struct } from 'effect'
import { SqlClient, SqlSchema } from 'effect/sql'
import { enDistribucion, PruebaAprobada, resumir } from '../../dominio/compatibilidad.ts'
import { capacidades, condiciones, evaluar, sugerirPerfil } from '../../dominio/evaluacion.ts'
import { NoEncontrado } from '../../dominio/fallos.ts'
import { JuegoId, UsuarioId } from '../../dominio/ids.ts'
import { EstadoRevision } from '../../dominio/revision.ts'
import { Diagnostico, EdicionJuego, Equipo, Juego, Lanzador, PerfilConfiguracion, Solucion, TipoFallo } from '../../dominio/tablas.ts'
import { Visitante } from '../auth.ts'
import { esDemo, etiquetaCapa, etiquetaDistribucion, etiquetaPerfil } from './etiquetas.ts'

/** A PruebaAprobada row plus its game and whether a demo account reported it. */
const PruebaDeJuego = Schema.Struct({ ...PruebaAprobada.fields, juego_id: JuegoId, ejemplo: Schema.Boolean })

/**
 * THE summary query of 8.10: approved reports flattened for `resumir`. `juego` null reads every game
 * (the catalog groups them in TS). Pending rows never get here: the WHERE excludes them, and
 * PruebaAprobada's `estado_revision: 'aprobado'` would refuse one anyway.
 */
export const pruebasAprobadas = (juego: JuegoId | null) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const filas = yield* sql`
      SELECT e.juego_id, r.id AS reporte_id, r.estado_revision, r.edicion_id, l.nombre AS lanzador, r.version_juego,
             d.distribucion_id, ${sql.literal(etiquetaDistribucion('dist'))} AS distribucion,
             r.version_capa_id, ${sql.literal(etiquetaCapa('vc'))} AS capa,
             r.perfil_id, ${sql.literal(etiquetaPerfil('p'))} AS perfil,
             r.resultado, r.fecha_prueba, r.fps_promedio, r.resolucion, r.calidad_grafica, r.metodo_medicion,
             COALESCE(array_agg(tf.codigo ORDER BY tf.codigo) FILTER (WHERE tf.id IS NOT NULL), '{}') AS fallos,
             ${sql.literal(esDemo('u'))} AS ejemplo
      FROM reporte r
      JOIN edicion_juego e ON e.id = r.edicion_id
      JOIN lanzador l ON l.id = e.lanzador_id
      JOIN diagnostico d ON d.id = r.diagnostico_id
      JOIN distribucion dist ON dist.id = d.distribucion_id
      JOIN equipo eq ON eq.id = d.equipo_id
      JOIN usuario u ON u.id = eq.usuario_id
      JOIN version_capa vc ON vc.id = r.version_capa_id
      LEFT JOIN perfil_configuracion p ON p.id = r.perfil_id
      LEFT JOIN reporte_fallo rf ON rf.reporte_id = r.id
      LEFT JOIN tipo_fallo tf ON tf.id = rf.tipo_fallo_id
      WHERE ${sql.and([sql`r.estado_revision = 'aprobado'`, ...(juego === null ? [] : [sql`e.juego_id = ${juego}`])])}
      GROUP BY r.id, e.id, l.id, d.id, dist.id, u.id, vc.id, p.id
      ORDER BY r.fecha_prueba DESC, r.id`
    return yield* Schema.decodeUnknownEffect(Schema.Array(PruebaDeJuego))(filas)
  })

/** The viewer's latest capture. Round 1 decision: no "active diagnosis" state that could go stale. */
const MiDiagnostico = Diagnostico.mapFields(
  Struct.pick(['id', 'capturado_en', 'sistema', 'distribucion_id', 'arquitectura', 'ram_mb', 'vram_mb', 'soporte_vulkan', 'version_vulkan']),
).mapFields(Struct.assign({ equipo: Equipo.fields.alias, distribucion: Schema.NullOr(Schema.String) }))

export const ultimoDiagnostico = (usuario: UsuarioId) =>
  Effect.flatMap(SqlClient.SqlClient, (sql) =>
    SqlSchema.findOneOption({
      Request: UsuarioId,
      Result: MiDiagnostico,
      execute: (id) => sql`
        SELECT d.id, d.capturado_en, d.sistema, d.distribucion_id, d.arquitectura, d.ram_mb, d.vram_mb, d.soporte_vulkan,
               d.version_vulkan, eq.alias AS equipo, ${sql.literal(etiquetaDistribucion('dist'))} AS distribucion
        FROM diagnostico d
        JOIN equipo eq ON eq.id = d.equipo_id
        LEFT JOIN distribucion dist ON dist.id = d.distribucion_id
        WHERE eq.usuario_id = ${id}
        ORDER BY d.capturado_en DESC, d.id DESC
        LIMIT 1`,
    })(usuario),
  )

/** The signed-in viewer's latest diagnosis, or none for guests and for accounts that never ran the detector. */
export const diagnosticoDelVisitante = Effect.flatMap(Visitante, (visitante) =>
  Option.match(visitante, { onNone: () => Effect.succeedNone, onSome: (u) => ultimoDiagnostico(u.id) }),
)

const FilaJuego = Juego.mapFields(Struct.pick(['id', 'titulo', 'descripcion']))

const FilaEdicion = EdicionJuego.mapFields(Struct.pick(['id', 'identificador_externo'])).mapFields(
  Struct.assign({ lanzador: Lanzador.fields.nombre }),
)

/** A profile as the ficha lists it: approved, or pending shown "en prueba" (8.9 lets users test it). Others never reach the page. */
const FilaPerfil = PerfilConfiguracion.mapFields(
  Struct.pick(['id', 'titulo', 'revision', 'distribucion_id', 'arquitectura', 'ram_min_mb', 'vram_min_mb', 'requiere_vulkan', 'version_vulkan_min']),
).mapFields(
  Struct.assign({
    estado_revision: EstadoRevision.pick(['aprobado', 'pendiente']),
    lanzador: Schema.String,
    distribucion: Schema.String,
    capa: Schema.String,
    ejemplo: Schema.Boolean,
  }),
)

const FilaSolucion = Solucion.mapFields(Struct.pick(['id', 'titulo', 'instrucciones'])).mapFields(
  Struct.assign({ codigo: TipoFallo.fields.codigo, autor: Schema.String, perfil: Schema.NullOr(Schema.String), ejemplo: Schema.Boolean }),
)

const Conteo = Schema.Struct({ n: Schema.Int })

/**
 * Everything the ficha shows. `pendientes` is a bare count: unreviewed content is not public (8.9),
 * and it never reaches `resumir`. `personal` is null without a diagnosis.
 */
export const fichaJuego = (juegoId: JuegoId) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient

    const juego = yield* SqlSchema.findOneOption({
      Request: JuegoId,
      Result: FilaJuego,
      execute: (id) => sql`SELECT id, titulo, descripcion FROM juego WHERE id = ${id}`,
    })(juegoId)
    if (Option.isNone(juego)) return yield* new NoEncontrado()

    const ediciones = yield* SqlSchema.findAll({
      Request: JuegoId,
      Result: FilaEdicion,
      execute: (id) => sql`
        SELECT e.id, e.identificador_externo, l.nombre AS lanzador
        FROM edicion_juego e JOIN lanzador l ON l.id = e.lanzador_id
        WHERE e.juego_id = ${id}
        ORDER BY l.nombre`,
    })(juegoId)

    const pruebas = yield* pruebasAprobadas(juegoId)
    const resumen = resumir(pruebas)

    const [pendientes] = yield* sql`
      SELECT count(*)::int AS n
      FROM reporte r JOIN edicion_juego e ON e.id = r.edicion_id
      WHERE e.juego_id = ${juegoId} AND r.estado_revision = 'pendiente'`.pipe(Effect.flatMap(Schema.decodeUnknownEffect(Schema.Tuple([Conteo]))))

    const filasPerfil = yield* SqlSchema.findAll({
      Request: JuegoId,
      Result: FilaPerfil,
      execute: (id) => sql`
        SELECT p.id, p.titulo, p.revision, p.distribucion_id, p.arquitectura, p.ram_min_mb, p.vram_min_mb, p.requiere_vulkan,
               p.version_vulkan_min, p.estado_revision, l.nombre AS lanzador,
               ${sql.literal(etiquetaDistribucion('dist'))} AS distribucion, ${sql.literal(etiquetaCapa('vc'))} AS capa,
               ${sql.literal(esDemo('u'))} AS ejemplo
        FROM perfil_configuracion p
        JOIN edicion_juego e ON e.id = p.edicion_id
        JOIN lanzador l ON l.id = e.lanzador_id
        JOIN distribucion dist ON dist.id = p.distribucion_id
        JOIN version_capa vc ON vc.id = p.version_capa_id
        JOIN usuario u ON u.id = p.autor_id
        WHERE e.juego_id = ${id} AND p.estado_revision IN ('aprobado', 'pendiente')
        ORDER BY p.estado_revision = 'aprobado' DESC, p.titulo, p.revision DESC`,
    })(juegoId)

    // RF-02/RF-03: approved solutions to failures seen in approved reports. A solution that recommends
    // a profile shows only while that profile is approved (8.9 "comprueba la vigencia").
    const soluciones = yield* SqlSchema.findAll({
      Request: JuegoId,
      Result: FilaSolucion,
      execute: (id) => sql`
        SELECT s.id, s.titulo, s.instrucciones, tf.codigo, u.alias AS autor, ${sql.literal(etiquetaPerfil('p'))} AS perfil,
               ${sql.literal(esDemo('u'))} AS ejemplo
        FROM solucion s
        JOIN reporte r ON r.id = s.reporte_id
        JOIN edicion_juego e ON e.id = r.edicion_id
        JOIN tipo_fallo tf ON tf.id = s.tipo_fallo_id
        JOIN usuario u ON u.id = s.autor_id
        LEFT JOIN perfil_configuracion p ON p.id = s.perfil_id
        WHERE e.juego_id = ${id} AND s.estado_revision = 'aprobado' AND r.estado_revision = 'aprobado'
          AND (s.perfil_id IS NULL OR p.estado_revision = 'aprobado')
        ORDER BY s.revisado_en DESC, s.id`,
    })(juegoId)
    const tiposFallo = yield* SqlSchema.findAll({
      Request: Schema.Void,
      Result: TipoFallo.mapFields(Struct.pick(['codigo', 'descripcion'])),
      execute: () => sql`SELECT codigo, descripcion FROM tipo_fallo`,
    })(undefined)
    const descripcion = new Map(tiposFallo.map((t) => [t.codigo, t.descripcion]))
    const causas = resumen.fallos.map((f) => ({
      ...f,
      descripcion: descripcion.get(f.codigo) ?? null,
      soluciones: soluciones.filter((s) => s.codigo === f.codigo),
    }))

    const diagnostico = yield* diagnosticoDelVisitante

    // 8.10: the hardware evaluation runs only against approved profiles, and only with a diagnosis.
    const perfiles = filasPerfil.map(({ ram_min_mb, vram_min_mb, requiere_vulkan, version_vulkan_min, ...p }) => ({
      ...p,
      evaluacion:
        Option.isSome(diagnostico) && p.estado_revision === 'aprobado'
          ? evaluar(capacidades(diagnostico.value), condiciones({ ram_min_mb, vram_min_mb, requiere_vulkan, version_vulkan_min }))
          : null,
    }))

    const personal = Option.match(diagnostico, {
      onNone: () => null,
      onSome: (d) => ({
        en_mi_distribucion:
          d.distribucion_id === null || d.distribucion === null
            ? null
            : { nombre: d.distribucion, resumen: enDistribucion(resumen, d.distribucion_id) },
        perfil: sugerirPerfil(
          perfiles.flatMap((p) => (p.evaluacion === null ? [] : [{ ...p, evaluacion: p.evaluacion }])),
          d,
        ),
      }),
    })

    return {
      juego: juego.value,
      ediciones,
      resumen,
      ejemplo: pruebas.some((p) => p.ejemplo),
      pendientes: pendientes.n,
      perfiles,
      causas,
      diagnostico: Option.match(diagnostico, {
        onNone: () => null,
        onSome: (d) => ({ equipo: d.equipo, capturado_en: d.capturado_en, distribucion_id: d.distribucion_id }),
      }),
      personal,
    }
  })
