import { Clock, Effect, Option, Schema, Struct } from 'effect'
import { SqlClient, SqlSchema } from 'effect/sql'
import { enDistribucion, PruebaAprobada, resumir } from '../../domain/compatibility.ts'
import { condiciones, evaluar, sugerirPerfil } from '../../domain/evaluation.ts'
import { NoEncontrado } from '../../domain/errors.ts'
import { JuegoId, UsuarioId } from '../../domain/ids.ts'
import { ApiGrafica } from '../../domain/literals.ts'
import { EstadoRevision, estadosVigentes } from '../../domain/review.ts'
import { rutaJuego } from '../../domain/graphics-path.ts'
import { Diagnostico, EdicionJuego, Equipo, Juego, JuegoApi, Lanzador, PerfilConfiguracion, Solucion, TipoFallo } from '../../domain/tables.ts'
import { Visitante } from '../auth.ts'
import { filas, unaFila } from '../rows.ts'
import { equipoEnLinux } from '../gpu/capability.ts'
import { esDemo, etiquetaCapa, etiquetaDistribucion, etiquetaPerfil } from './labels.ts'
import { resumenesProtonDb } from './protondb.ts'

const PruebaDeJuego = Schema.Struct({ ...PruebaAprobada.fields, juego_id: JuegoId, ejemplo: Schema.Boolean })

export const pruebasAprobadas = (juego: JuegoId | null) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    return yield* filas(
      PruebaDeJuego,
      sql`
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
      ORDER BY r.fecha_prueba DESC, r.id`,
    )
  })

const MiDiagnostico = Diagnostico.mapFields(
  Struct.pick([
    'id',
    'capturado_en',
    'sistema',
    'distribucion_id',
    'arquitectura',
    'ram_mb',
    'vram_mb',
    'soporte_vulkan',
    'version_vulkan',
    'controlador',
    'gpu_pci_id',
    'nivel_x86',
  ]),
).mapFields(Struct.assign({ equipo: Equipo.fields.alias, distribucion: Schema.NullOr(Schema.String) }))

export const ultimoDiagnostico = (usuario: UsuarioId) =>
  Effect.flatMap(SqlClient.SqlClient, (sql) =>
    SqlSchema.findOneOption({
      Request: UsuarioId,
      Result: MiDiagnostico,
      execute: (id) => sql`
        SELECT d.id, d.capturado_en, d.sistema, d.distribucion_id, d.arquitectura, d.ram_mb, d.vram_mb, d.soporte_vulkan,
               d.version_vulkan, d.controlador, d.gpu_pci_id, d.nivel_x86, eq.alias AS equipo, ${sql.literal(etiquetaDistribucion('dist'))} AS distribucion
        FROM diagnostico d
        JOIN equipo eq ON eq.id = d.equipo_id
        LEFT JOIN distribucion dist ON dist.id = d.distribucion_id
        WHERE eq.usuario_id = ${id}
        ORDER BY d.capturado_en DESC, d.id DESC
        LIMIT 1`,
    })(usuario),
  )

export const diagnosticoDelVisitante = Effect.flatMap(Visitante, (visitante) =>
  Option.match(visitante, { onNone: () => Effect.succeedNone, onSome: (u) => ultimoDiagnostico(u.id) }),
)

const FilaJuego = Juego.mapFields(Struct.pick(['id', 'titulo', 'descripcion', 'nivel_x86_min']))

const FilaEdicion = EdicionJuego.mapFields(Struct.pick(['id', 'identificador_externo'])).mapFields(
  Struct.assign({ lanzador: Lanzador.fields.nombre }),
)

const FilaPerfil = PerfilConfiguracion.mapFields(
  Struct.pick(['id', 'titulo', 'revision', 'distribucion_id', 'arquitectura', 'ram_min_mb', 'vram_min_mb', 'requiere_vulkan', 'version_vulkan_min']),
).mapFields(
  Struct.assign({
    estado_revision: EstadoRevision.pick(estadosVigentes),
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

export const fichaJuego = (juegoId: JuegoId) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient

    const juego = yield* SqlSchema.findOneOption({
      Request: JuegoId,
      Result: FilaJuego,
      execute: (id) => sql`SELECT id, titulo, descripcion, nivel_x86_min FROM juego WHERE id = ${id}`,
    })(juegoId)
    if (Option.isNone(juego)) return yield* new NoEncontrado()

    const declaradas = yield* SqlSchema.findAll({
      Request: JuegoId,
      Result: JuegoApi.mapFields(Struct.pick(['api'])),
      execute: (id) => sql`SELECT api FROM juego_api WHERE juego_id = ${id}`,
    })(juegoId)
    const apis = ApiGrafica.literals.filter((api) => declaradas.some((d) => d.api === api))

    const ediciones = yield* SqlSchema.findAll({
      Request: JuegoId,
      Result: FilaEdicion,
      execute: (id) => sql`
        SELECT e.id, e.identificador_externo, l.nombre AS lanzador
        FROM edicion_juego e JOIN lanzador l ON l.id = e.lanzador_id
        WHERE e.juego_id = ${id}
        ORDER BY l.nombre`,
    })(juegoId)

    const ahora = new Date(yield* Clock.currentTimeMillis)
    const pruebas = yield* pruebasAprobadas(juegoId)
    const resumen = resumir(pruebas, ahora)

    const pendientes = yield* unaFila(
      Conteo,
      sql`
        SELECT count(*)::int AS n
        FROM reporte r JOIN edicion_juego e ON e.id = r.edicion_id
        WHERE e.juego_id = ${juegoId} AND r.estado_revision = 'pendiente'`,
    )

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
        WHERE e.juego_id = ${id} AND p.estado_revision IN ${sql.in(estadosVigentes)}
        ORDER BY p.estado_revision = 'aprobado' DESC, p.titulo, p.revision DESC`,
    })(juegoId)

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
      Result: TipoFallo.mapFields(Struct.pick(['id', 'codigo', 'descripcion'])),
      execute: () => sql`SELECT id, codigo, descripcion FROM tipo_fallo`,
    })(undefined)
    const tipoPorCodigo = new Map(tiposFallo.map((t) => [t.codigo, t]))
    const causas = resumen.fallos.map((f) => {
      const tipo = tipoPorCodigo.get(f.codigo)
      const reporte = pruebas.find((p) => p.fallos.includes(f.codigo))
      return {
        ...f,
        descripcion: tipo?.descripcion ?? null,
        soluciones: soluciones.filter((s) => s.codigo === f.codigo),
        responder: tipo && reporte ? { reporte_id: reporte.reporte_id, tipo_fallo_id: tipo.id } : null,
      }
    })

    const [protondb = null] = yield* resumenesProtonDb(juegoId)
    const diagnostico = yield* diagnosticoDelVisitante
    const equipo = Option.map(diagnostico, equipoEnLinux)

    const perfiles = filasPerfil.map(({ ram_min_mb, vram_min_mb, requiere_vulkan, version_vulkan_min, ...p }) => ({
      ...p,
      evaluacion:
        Option.isSome(equipo) && p.estado_revision === 'aprobado'
          ? evaluar(equipo.value, condiciones({ ram_min_mb, vram_min_mb, requiere_vulkan, version_vulkan_min }))
          : null,
    }))

    const personal = Option.match(Option.all({ d: diagnostico, equipo }), {
      onNone: () => null,
      onSome: ({ d, equipo }) => ({
        ruta: rutaJuego(equipo, d.nivel_x86, { apis, nivel_x86_min: juego.value.nivel_x86_min }),
        nivel_x86_min: juego.value.nivel_x86_min,
        orientativa: d.sistema === 'Windows',
        en_mi_distribucion:
          d.distribucion_id === null || d.distribucion === null
            ? null
            : { nombre: d.distribucion, resumen: enDistribucion(pruebas, d.distribucion_id, ahora) },
        perfil: sugerirPerfil(
          perfiles.flatMap((p) => (p.evaluacion === null ? [] : [{ ...p, evaluacion: p.evaluacion }])),
          d,
        ),
      }),
    })

    return {
      juego: { ...juego.value, apis },
      ediciones,
      resumen,
      protondb,
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
