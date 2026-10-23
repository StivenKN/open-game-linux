import { Clock, Effect, Schema, Struct } from 'effect'
import { SqlClient, SqlSchema } from 'effect/sql'
import type { CatalogFilter } from '../../domain/contributions.ts'
import { type CompatibilityStatus, summarize } from '../../domain/compatibility.ts'
import { Game, Launcher } from '../../domain/tables.ts'
import { oneRow } from '../rows.ts'
import { approvedTests } from './game.ts'
import { protonDbSummaries } from './protondb.ts'

const GameRow = Game.mapFields(Struct.pick(['id', 'title'])).mapFields(
  Struct.assign({ launchers: Schema.Array(Launcher.fields.name), pending: Schema.Int }),
)

const Counters = Schema.Struct({
  verified_games: Schema.Int,
  approved_reports: Schema.Int,
  approved_profiles: Schema.Int,
  tested_distributions: Schema.Int,
  upstream_fixes: Schema.Int,
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
        SELECT j.id, j.title,
               COALESCE(array_agg(l.name ORDER BY l.name) FILTER (WHERE l.id IS NOT NULL), '{}') AS launchers,
               (SELECT count(*)::int FROM report r JOIN game_edition x ON x.id = r.edition_id
                 WHERE x.game_id = j.id AND r.review_status = 'pendiente') AS pending
        FROM game j
        LEFT JOIN game_edition e ON e.game_id = j.id
        LEFT JOIN launcher l ON l.id = e.launcher_id
        WHERE ${sql.and([
          // A substring, or a near miss: `<%` holds when word_similarity(q, title) reaches pg_trgm's
          // word_similarity_threshold, whose default 0.6 lets «cyberpnk» find Cyberpunk 2077 (tests/queries.test.ts).
          ...(q === '' ? [] : [sql`(j.title ILIKE ${literalLike(q)} OR ${q} <% j.title)`]),
          ...(filter.lanzador === undefined
            ? []
            : [sql`EXISTS (SELECT 1 FROM game_edition x WHERE x.game_id = j.id AND x.launcher_id = ${filter.lanzador})`]),
        ])}
        GROUP BY j.id
        ORDER BY ${q === '' ? sql`j.title` : sql`word_similarity(${q}, j.title) DESC, j.title`}`,
    })(undefined)

    const now = new Date(yield* Clock.currentTimeMillis)
    const allTests = yield* approvedTests(null)
    const protondb = new Map((yield* protonDbSummaries(null)).map((r) => [r.game_id, r]))
    const candidates = rows
      .map((j) => {
        const tests = allTests.filter((p) => p.game_id === j.id)
        const { status, test_count, no_recent_confirmation, last_tested, failures } = summarize(tests, now)
        const external = protondb.get(j.id)
        return {
          ...j,
          summary: { status, test_count, no_recent_confirmation, last_tested, failures },
          demo: tests.some((p) => p.demo),
          protondb: external ? Struct.pick(external, ['recent', 'recent_working', 'total_reports']) : null,
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
        SELECT count(DISTINCT e.game_id)::int AS verified_games,
               count(*)::int AS approved_reports,
               (SELECT count(*)::int FROM profile WHERE review_status = 'aprobado') AS approved_profiles,
               count(DISTINCT d.distribution_id)::int AS tested_distributions,
               (SELECT count(*)::int FROM upstream_fix) AS upstream_fixes
        FROM report r
        JOIN game_edition e ON e.id = r.edition_id
        JOIN diagnostic d ON d.id = r.diagnostic_id
        WHERE r.review_status = 'aprobado'`,
    )

    const launchers = yield* SqlSchema.findAll({
      Request: Schema.Void,
      Result: Launcher.mapFields(Struct.pick(['id', 'name'])),
      execute: () => sql`SELECT id, name FROM launcher ORDER BY name`,
    })(undefined)

    return { games, by_status, launchers, counters }
  })
