// Read model of the ficha (wireframe 9.3). One Effect program; its success type IS the page data type
// (inferred through the server fn into Route.useLoaderData). No hand-written page props.
import { Effect, Option, Schema } from 'effect'
import { SqlClient, SqlError, SqlSchema } from 'effect/sql'
import { enDistribucion, PruebaAprobada, Resultado, resumir } from '../../dominio/compatibilidad.ts'
import { capacidades, condiciones, evaluar, sugerirPerfil, SoporteVulkan, Sistema } from '../../dominio/evaluacion.ts'
import { NoEncontrado } from '../../dominio/fallos.ts'
import { DiagnosticoId, DistribucionId, EdicionId, JuegoId, PerfilId, ReporteId } from '../../dominio/ids.ts'
import { EstadoRevision } from '../../dominio/revision.ts'
import { Visitante } from '../auth.ts'

const Juego = Schema.Struct({ id: JuegoId, titulo: Schema.String, descripcion: Schema.String, actualizado_en: Schema.Date })
const Edicion = Schema.Struct({ id: EdicionId, lanzador: Schema.String, identificador_externo: Schema.NullOr(Schema.String) })

/** A profile row as listed on the ficha, with its known conditions (evaluated below, never stored). */
const PerfilFila = Schema.Struct({
  id: PerfilId,
  titulo: Schema.String,
  revision: Schema.Int,
  estado_revision: EstadoRevision, // aprobado, or pendiente shown as "en prueba" (8.9 lets users test it)
  lanzador: Schema.String,
  distribucion_id: DistribucionId,
  distribucion: Schema.String,
  capa: Schema.String,
  arquitectura: Schema.String,
  version_juego_objetivo: Schema.NullOr(Schema.String),
  ram_min_mb: Schema.NullOr(Schema.Int),
  vram_min_mb: Schema.NullOr(Schema.Int),
  requiere_vulkan: Schema.NullOr(Schema.Boolean),
  version_vulkan_min: Schema.NullOr(Schema.String),
})

/** A community report card. Public fields only: alias + technical context (8.9 privacy). */
const ReporteFila = Schema.Struct({
  id: ReporteId,
  autor: Schema.String, // usuario.alias via diagnostico -> equipo -> usuario
  lanzador: Schema.String,
  version_juego: Schema.String,
  distribucion: Schema.String,
  capa: Schema.String,
  perfil: Schema.NullOr(Schema.String),
  gpu_modelo: Schema.String,
  ram_mb: Schema.Int,
  fecha_prueba: Schema.Date,
  resultado: Resultado,
  fps_promedio: Schema.NullOr(Schema.FiniteFromString),
  resolucion: Schema.NullOr(Schema.String),
  calidad_grafica: Schema.NullOr(Schema.String),
  metodo_medicion: Schema.NullOr(Schema.String),
  observaciones: Schema.String,
  fallos: Schema.Array(Schema.Struct({ codigo: Schema.String, detalle: Schema.String })), // json_agg
})

/** The viewer's latest capture (round 1: no "active diagnosis" state that could go stale). */
const MiDiagnostico = Schema.Struct({
  id: DiagnosticoId,
  equipo: Schema.String,
  capturado_en: Schema.Date,
  sistema: Sistema,
  distribucion_id: Schema.NullOr(DistribucionId),
  distribucion: Schema.NullOr(Schema.String),
  arquitectura: Schema.String,
  ram_mb: Schema.Int,
  vram_mb: Schema.NullOr(Schema.Int),
  soporte_vulkan: SoporteVulkan,
  version_vulkan: Schema.NullOr(Schema.String),
})

/**
 * Everything the ficha shows. Pending reports are listed separately and never reach `resumir`
 * (PruebaAprobada's decode would reject them anyway).
 */
export const fichaJuego = (juegoId: JuegoId) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const visitante = yield* Visitante

    const juego = yield* SqlSchema.findOneOption({
      Request: JuegoId,
      Result: Juego,
      execute: (id) => sql`SELECT id, titulo, descripcion, actualizado_en FROM juego WHERE id = ${id}`,
    })(juegoId).pipe(Effect.flatMap(Option.match({ onNone: () => Effect.fail(new NoEncontrado()), onSome: Effect.succeed })))

    const pruebas = yield* SqlSchema.findAll({
      Request: JuegoId,
      Result: PruebaAprobada,
      execute: (id) => sql`
        SELECT r.id AS reporte_id, r.estado_revision, r.edicion_id, l.nombre AS lanzador, r.version_juego,
               d.distribucion_id, dist.nombre || ' ' || dist.version AS distribucion,
               r.version_capa_id, vc.variante || ' ' || vc.version AS capa,
               r.perfil_id, CASE WHEN p.id IS NULL THEN NULL ELSE p.titulo || ' r' || p.revision END AS perfil,
               r.resultado, r.fecha_prueba, r.fps_promedio, r.resolucion, r.calidad_grafica, r.metodo_medicion,
               COALESCE(array_agg(tf.codigo) FILTER (WHERE tf.codigo IS NOT NULL), '{}') AS fallos
        FROM reporte r
        JOIN edicion_juego e ON e.id = r.edicion_id
        JOIN lanzador l ON l.id = e.lanzador_id
        JOIN diagnostico d ON d.id = r.diagnostico_id
        JOIN distribucion dist ON dist.id = d.distribucion_id
        JOIN version_capa vc ON vc.id = r.version_capa_id
        LEFT JOIN perfil_configuracion p ON p.id = r.perfil_id
        LEFT JOIN reporte_fallo rf ON rf.reporte_id = r.id
        LEFT JOIN tipo_fallo tf ON tf.id = rf.tipo_fallo_id
        WHERE e.juego_id = ${id} AND r.estado_revision = 'aprobado'
        GROUP BY r.id, l.nombre, d.distribucion_id, dist.nombre, dist.version, vc.variante, vc.version, p.id
        ORDER BY r.fecha_prueba DESC`,
    })(juegoId)
    const resumen = resumir(pruebas)

    const ediciones = yield* edicionesDe(juegoId)
    const perfilesFilas = yield* perfilesDe(juegoId) // aprobado + pendiente, newest revision first
    const pendientes = yield* reportesDe(juegoId, 'pendiente')
    const aprobados = yield* reportesDe(juegoId, 'aprobado')
    const causas = yield* causasConocidas(juegoId)

    const diagnostico = yield* Option.match(visitante, {
      onNone: () => Effect.succeed(Option.none<typeof MiDiagnostico.Type>()),
      onSome: (u) => ultimoDiagnostico(u.id),
    })

    // Hardware evaluation per APPROVED profile, only when the viewer has a diagnosis (8.10).
    const perfiles = perfilesFilas.map((p) => ({
      ...p,
      evaluacion: Option.isSome(diagnostico) && p.estado_revision === 'aprobado' ? evaluar(capacidades(diagnostico.value), condiciones(p)) : null,
    }))

    const personal = Option.match(diagnostico, {
      onNone: () => null,
      onSome: (d) => ({
        diagnostico: d,
        en_mi_distribucion: d.distribucion_id === null ? null : enDistribucion(resumen, d.distribucion_id),
        perfil_sugerido: sugerirPerfil(perfiles.filter((p) => p.estado_revision === 'aprobado'), d),
      }),
    })

    return { juego, ediciones, resumen, personal, perfiles, causas, aprobados, pendientes }
  })

export type FichaJuego = Effect.Success<ReturnType<typeof fichaJuego>>

// ------------------------------------------------------------------ private queries (bodies in U4)

type Fallo = Schema.SchemaError | SqlError.SqlError

const edicionesDe = (juegoId: JuegoId): Effect.Effect<ReadonlyArray<typeof Edicion.Type>, Fallo, SqlClient.SqlClient> => {
  void juegoId
  return Effect.die('not implemented')
}
const perfilesDe = (juegoId: JuegoId): Effect.Effect<ReadonlyArray<typeof PerfilFila.Type>, Fallo, SqlClient.SqlClient> => {
  void juegoId
  return Effect.die('not implemented')
}
const reportesDe = (juegoId: JuegoId, estado: 'aprobado' | 'pendiente'): Effect.Effect<ReadonlyArray<typeof ReporteFila.Type>, Fallo, SqlClient.SqlClient> => {
  void juegoId
  void estado
  return Effect.die('not implemented')
}
/** RF-02/RF-03: failure codes from APPROVED reports, each with its approved solutions (estado_revision = 'aprobado', so retired ones vanish). */
const causasConocidas = (
  juegoId: JuegoId,
): Effect.Effect<
  ReadonlyArray<{ codigo: string; descripcion: string; reportes: number; soluciones: ReadonlyArray<{ id: number; titulo: string; instrucciones: string; autor: string; perfil_id: PerfilId | null }> }>,
  Fallo,
  SqlClient.SqlClient
> => {
  void juegoId
  return Effect.die('not implemented')
}
const ultimoDiagnostico = (
  usuario: string,
): Effect.Effect<Option.Option<typeof MiDiagnostico.Type>, Fallo, SqlClient.SqlClient> => {
  void usuario
  return Effect.die('not implemented')
}
