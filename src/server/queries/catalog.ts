import { Clock, Effect, Schema, Struct } from 'effect'
import { SqlClient, SqlSchema } from 'effect/sql'
import type { CatalogFilter } from '../../domain/contributions.ts'
import { type CompatibilityStatus, summarize } from '../../domain/compatibility.ts'
import { Game, Launcher } from '../../domain/tables.ts'
import { unaFila } from '../rows.ts'
import { pruebasAprobadas } from './game.ts'
import { resumenesProtonDb } from './protondb.ts'

const FilaJuego = Game.mapFields(Struct.pick(['id', 'titulo'])).mapFields(
  Struct.assign({ lanzadores: Schema.Array(Launcher.fields.nombre), pendientes: Schema.Int }),
)

const Contadores = Schema.Struct({
  juegos_verificados: Schema.Int,
  reportes_aprobados: Schema.Int,
  perfiles_aprobados: Schema.Int,
  distribuciones_probadas: Schema.Int,
  arreglos_upstream: Schema.Int,
})

/** ILIKE treats % and _ as wildcards; a title search means them literally. */
const literalLike = (texto: string) => `%${texto.replace(/[\\%_]/g, '\\$&')}%`

export const catalogo = (filtro: CatalogFilter) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const q = filtro.q?.trim() ?? ''

    const filas = yield* SqlSchema.findAll({
      Request: Schema.Void,
      Result: FilaJuego,
      execute: () => sql`
        SELECT j.id, j.titulo,
               COALESCE(array_agg(l.nombre ORDER BY l.nombre) FILTER (WHERE l.id IS NOT NULL), '{}') AS lanzadores,
               (SELECT count(*)::int FROM reporte r JOIN edicion_juego x ON x.id = r.edicion_id
                 WHERE x.juego_id = j.id AND r.estado_revision = 'pendiente') AS pendientes
        FROM juego j
        LEFT JOIN edicion_juego e ON e.juego_id = j.id
        LEFT JOIN lanzador l ON l.id = e.lanzador_id
        WHERE ${sql.and([
          ...(q === '' ? [] : [sql`j.titulo ILIKE ${literalLike(q)}`]),
          ...(filtro.lanzador === undefined
            ? []
            : [sql`EXISTS (SELECT 1 FROM edicion_juego x WHERE x.juego_id = j.id AND x.lanzador_id = ${filtro.lanzador})`]),
        ])}
        GROUP BY j.id
        ORDER BY j.titulo`,
    })(undefined)

    const ahora = new Date(yield* Clock.currentTimeMillis)
    const todas = yield* pruebasAprobadas(null)
    const protondb = new Map((yield* resumenesProtonDb(null)).map((r) => [r.juego_id, r]))
    const candidatos = filas
      .map((j) => {
        const pruebas = todas.filter((p) => p.juego_id === j.id)
        const { status: estado, test_count: aprobados, no_recent_confirmation: sin_confirmacion_reciente, last_tested: ultima_prueba, failures: fallos } = summarize(pruebas, ahora)
        const externo = protondb.get(j.id)
        return {
          ...j,
          resumen: { estado, pruebas: aprobados, sin_confirmacion_reciente, ultima_prueba, fallos },
          ejemplo: pruebas.some((p) => p.ejemplo),
          protondb: externo ? Struct.pick(externo, ['recientes', 'recientes_funcionan', 'reportes_total']) : null,
        }
      })
      .filter((j) => filtro.sin_anti_cheat !== true || !j.resumen.fallos.some((f) => f.code === 'anti_cheat'))
    const juegos = filtro.estado === undefined ? candidatos : candidatos.filter((j) => j.resumen.estado === filtro.estado)

    // Counted before the estado filter, so each status filter shows how many games it would list.
    const cuantos = (estado: CompatibilityStatus) => candidatos.filter((j) => j.resumen.estado === estado).length
    const por_estado = {
      sin_evidencia: cuantos('sin_evidencia'),
      funciona: cuantos('funciona'),
      funciona_con_ajustes: cuantos('funciona_con_ajustes'),
      no_inicia: cuantos('no_inicia'),
      falla_en_ejecucion: cuantos('falla_en_ejecucion'),
      resultados_variables: cuantos('resultados_variables'),
    } satisfies Record<CompatibilityStatus, number>

    // arreglos_upstream needs no demo filter: its writer refuses demo profiles.
    const contadores = yield* unaFila(
      Contadores,
      sql`
        SELECT count(DISTINCT e.juego_id)::int AS juegos_verificados,
               count(*)::int AS reportes_aprobados,
               (SELECT count(*)::int FROM perfil_configuracion WHERE estado_revision = 'aprobado') AS perfiles_aprobados,
               count(DISTINCT d.distribucion_id)::int AS distribuciones_probadas,
               (SELECT count(*)::int FROM arreglo_upstream) AS arreglos_upstream
        FROM reporte r
        JOIN edicion_juego e ON e.id = r.edicion_id
        JOIN diagnostico d ON d.id = r.diagnostico_id
        WHERE r.estado_revision = 'aprobado'`,
    )

    const lanzadores = yield* SqlSchema.findAll({
      Request: Schema.Void,
      Result: Launcher.mapFields(Struct.pick(['id', 'nombre'])),
      execute: () => sql`SELECT id, nombre FROM lanzador ORDER BY nombre`,
    })(undefined)

    return { juegos, por_estado, lanzadores, contadores }
  })
