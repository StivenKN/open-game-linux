import { Clock, Effect, Schema, Struct } from 'effect'
import { SqlClient, SqlSchema } from 'effect/sql'
import type { CatalogFilter } from '../../domain/contributions.ts'
import { type CompatibilityStatus, summarize } from '../../domain/compatibility.ts'
import { Game, Launcher } from '../../domain/tables.ts'
import { oneRow } from '../rows.ts'
import { approvedTests } from './game.ts'
import { protonDbSummaries } from './protondb.ts'

const GameRow = Game.mapFields(Struct.pick(['id', 'titulo'])).mapFields(
  Struct.assign({ lanzadores: Schema.Array(Launcher.fields.nombre), pendientes: Schema.Int }),
)

const Counters = Schema.Struct({
  juegos_verificados: Schema.Int,
  reportes_aprobados: Schema.Int,
  perfiles_aprobados: Schema.Int,
  distribuciones_probadas: Schema.Int,
  arreglos_upstream: Schema.Int,
})

/** ILIKE treats % and _ as wildcards; a title search means them literally. */
const literalLike = (text: string) => `%${text.replace(/[\\%_]/g, '\\$&')}%`

export const catalog = (filter: CatalogFilter) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const q = filter.q?.trim() ?? ''

    const rows = yield* SqlSchema.findAll({
      Request: Schema.Void,
      Result: GameRow,
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
          ...(filter.lanzador === undefined
            ? []
            : [sql`EXISTS (SELECT 1 FROM edicion_juego x WHERE x.juego_id = j.id AND x.lanzador_id = ${filter.lanzador})`]),
        ])}
        GROUP BY j.id
        ORDER BY j.titulo`,
    })(undefined)

    const now = new Date(yield* Clock.currentTimeMillis)
    const allTests = yield* approvedTests(null)
    const protondb = new Map((yield* protonDbSummaries(null)).map((r) => [r.juego_id, r]))
    const candidates = rows
      .map((j) => {
        const tests = allTests.filter((p) => p.juego_id === j.id)
        const { status, test_count, no_recent_confirmation, last_tested, failures } = summarize(tests, now)
        const external = protondb.get(j.id)
        return {
          ...j,
          summary: { status, test_count, no_recent_confirmation, last_tested, failures },
          ejemplo: tests.some((p) => p.ejemplo),
          protondb: external ? Struct.pick(external, ['recientes', 'recientes_funcionan', 'reportes_total']) : null,
        }
      })
      .filter((j) => filter.sin_anti_cheat !== true || !j.summary.failures.some((f) => f.code === 'anti_cheat'))
    const games = filter.estado === undefined ? candidates : candidates.filter((j) => j.summary.status === filter.estado)

    // Counted before the estado filter, so each status filter shows how many games it would list.
    const countWith = (status: CompatibilityStatus) => candidates.filter((j) => j.summary.status === status).length
    const by_status = {
      sin_evidencia: countWith('sin_evidencia'),
      funciona: countWith('funciona'),
      funciona_con_ajustes: countWith('funciona_con_ajustes'),
      no_inicia: countWith('no_inicia'),
      falla_en_ejecucion: countWith('falla_en_ejecucion'),
      resultados_variables: countWith('resultados_variables'),
    } satisfies Record<CompatibilityStatus, number>

    // arreglos_upstream needs no demo filter: its writer refuses demo profiles.
    const counters = yield* oneRow(
      Counters,
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

    const launchers = yield* SqlSchema.findAll({
      Request: Schema.Void,
      Result: Launcher.mapFields(Struct.pick(['id', 'nombre'])),
      execute: () => sql`SELECT id, nombre FROM lanzador ORDER BY nombre`,
    })(undefined)

    return { games, by_status, launchers, counters }
  })
