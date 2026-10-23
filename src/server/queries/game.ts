import { Clock, Effect, Option, Schema, Struct } from 'effect'
import { SqlClient, SqlSchema } from 'effect/sql'
import { onDistribution, ApprovedTest, summarize, timeline } from '../../domain/compatibility.ts'
import { requirements, evaluate, suggestProfile } from '../../domain/evaluation.ts'
import { NotFound } from '../../domain/errors.ts'
import { newsSince } from '../../domain/follow.ts'
import { GameId, UserId } from '../../domain/ids.ts'
import { GraphicsApi } from '../../domain/literals.ts'
import { ReviewStatus, activeStatuses } from '../../domain/review.ts'
import { gamePath } from '../../domain/graphics-path.ts'
import { Diagnostic, GameEdition, Machine, Game, GameApi, GameFollow, Launcher, Profile, Solution, FailureType } from '../../domain/tables.ts'
import { Visitor } from '../auth.ts'
import { rows, oneRow } from '../rows.ts'
import { machineOnLinux } from '../gpu/capability.ts'
import { isDemo, layerLabel, distributionLabel, profileLabel } from './labels.ts'
import { protonDbSummaries } from './protondb.ts'

const GameTest = Schema.Struct({ ...ApprovedTest.fields, game_id: GameId, demo: Schema.Boolean })

const DatabaseNow = Schema.Struct({ now: Schema.Date })

/**
 * What "Marcar como visto" may mark seen, read before the approved tests. It comes from the clock that stamps
 * `reviewed_at` (Postgres, not the app's `Clock`), so every approval stamped later is news. Only an approval
 * whose transaction is still open during the read can fall behind it. The driver decodes timestamps to the
 * millisecond, so the watermark steps back one: an approval later in the same millisecond still reads later.
 */
export const seenWatermark = Effect.flatMap(SqlClient.SqlClient, (sql) =>
  Effect.map(oneRow(DatabaseNow, sql`SELECT now() - interval '1 millisecond' AS now`), (row) => row.now),
)

/** The approved tests of one game, of the games a user follows, or (null) of the whole catalog. */
export const approvedTests = (scope: { readonly game: GameId } | { readonly followedBy: UserId } | null) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const games =
      scope === null
        ? []
        : 'game' in scope
          ? [sql`e.game_id = ${scope.game}`]
          : [sql`e.game_id IN (SELECT game_id FROM game_follow WHERE user_id = ${scope.followedBy})`]
    return yield* rows(
      GameTest,
      sql`
      SELECT e.game_id, r.id AS report_id, r.review_status, r.edition_id, l.name AS launcher, r.game_version,
             d.distribution_id, ${sql.literal(distributionLabel('dist'))} AS distribution,
             r.layer_version_id, ${sql.literal(layerLabel('vc'))} AS layer,
             r.profile_id, ${sql.literal(profileLabel('p'))} AS profile,
             r.outcome, r.tested_at, r.reviewed_at, r.avg_fps, r.resolution, r.graphics_quality, r.measurement_method,
             COALESCE(array_agg(tf.code ORDER BY tf.code) FILTER (WHERE tf.id IS NOT NULL), '{}') AS failures,
             ${sql.literal(isDemo('u'))} AS demo
      FROM report r
      JOIN game_edition e ON e.id = r.edition_id
      JOIN launcher l ON l.id = e.launcher_id
      JOIN diagnostic d ON d.id = r.diagnostic_id
      JOIN distribution dist ON dist.id = d.distribution_id
      JOIN machine eq ON eq.id = d.machine_id
      JOIN app_user u ON u.id = eq.user_id
      JOIN layer_version vc ON vc.id = r.layer_version_id
      LEFT JOIN profile p ON p.id = r.profile_id
      LEFT JOIN report_failure rf ON rf.report_id = r.id
      LEFT JOIN failure_type tf ON tf.id = rf.failure_type_id
      WHERE ${sql.and([sql`r.review_status = 'aprobado'`, ...games])}
      GROUP BY r.id, e.id, l.id, d.id, dist.id, u.id, vc.id, p.id
      ORDER BY r.tested_at DESC, r.id`,
    )
  })

const MyDiagnostic = Diagnostic.mapFields(
  Struct.pick([
    'id',
    'captured_at',
    'operating_system',
    'distribution_id',
    'architecture',
    'ram_mb',
    'vram_mb',
    'vulkan_support',
    'vulkan_version',
    'driver',
    'gpu_pci_id',
    'x86_level',
  ]),
).mapFields(Struct.assign({ machine: Machine.fields.alias, distribution: Schema.NullOr(Schema.String) }))

export const latestDiagnostic = (user: UserId) =>
  Effect.flatMap(SqlClient.SqlClient, (sql) =>
    SqlSchema.findOneOption({
      Request: UserId,
      Result: MyDiagnostic,
      execute: (id) => sql`
        SELECT d.id, d.captured_at, d.operating_system, d.distribution_id, d.architecture, d.ram_mb, d.vram_mb, d.vulkan_support,
               d.vulkan_version, d.driver, d.gpu_pci_id, d.x86_level, eq.alias AS machine, ${sql.literal(distributionLabel('dist'))} AS distribution
        FROM diagnostic d
        JOIN machine eq ON eq.id = d.machine_id
        LEFT JOIN distribution dist ON dist.id = d.distribution_id
        WHERE eq.user_id = ${id}
        ORDER BY d.captured_at DESC, d.id DESC
        LIMIT 1`,
    })(user),
  )

export const visitorDiagnostic = Effect.flatMap(Visitor, (visitor) =>
  Option.match(visitor, { onNone: () => Effect.succeedNone, onSome: (u) => latestDiagnostic(u.id) }),
)

const SeenAt = GameFollow.mapFields(Struct.pick(['seen_at']))

const visitorFollow = (game: GameId) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const visitor = yield* Visitor
    if (Option.isNone(visitor)) return Option.none()
    const [follow] = yield* rows(SeenAt, sql`SELECT seen_at FROM game_follow WHERE user_id = ${visitor.value.id} AND game_id = ${game}`)
    return Option.fromNullishOr(follow)
  })

const GameRow = Game.mapFields(Struct.pick(['id', 'title', 'description', 'x86_level_min']))

const EditionRow = GameEdition.mapFields(Struct.pick(['id', 'external_id'])).mapFields(
  Struct.assign({ launcher: Launcher.fields.name }),
)

const ProfileRow = Profile.mapFields(
  Struct.pick(['id', 'title', 'revision', 'distribution_id', 'architecture', 'ram_min_mb', 'vram_min_mb', 'requires_vulkan', 'vulkan_version_min']),
).mapFields(
  Struct.assign({
    review_status: ReviewStatus.pick(activeStatuses),
    launcher: Schema.String,
    distribution: Schema.String,
    layer: Schema.String,
    demo: Schema.Boolean,
  }),
)

const SolutionRow = Solution.mapFields(Struct.pick(['id', 'title', 'instructions'])).mapFields(
  Struct.assign({ code: FailureType.fields.code, author: Schema.String, profile: Schema.NullOr(Schema.String), demo: Schema.Boolean }),
)

const Count = Schema.Struct({ n: Schema.Int })

export const gamePage = (gameId: GameId) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient

    const game = yield* SqlSchema.findOneOption({
      Request: GameId,
      Result: GameRow,
      execute: (id) => sql`SELECT id, title, description, x86_level_min FROM game WHERE id = ${id}`,
    })(gameId)
    if (Option.isNone(game)) return yield* new NotFound()

    const declared = yield* SqlSchema.findAll({
      Request: GameId,
      Result: GameApi.mapFields(Struct.pick(['api'])),
      execute: (id) => sql`SELECT api FROM game_api WHERE game_id = ${id}`,
    })(gameId)
    const apis = GraphicsApi.literals.filter((api) => declared.some((d) => d.api === api))

    const editions = yield* SqlSchema.findAll({
      Request: GameId,
      Result: EditionRow,
      execute: (id) => sql`
        SELECT e.id, e.external_id, l.name AS launcher
        FROM game_edition e JOIN launcher l ON l.id = e.launcher_id
        WHERE e.game_id = ${id}
        ORDER BY l.name`,
    })(gameId)

    const now = new Date(yield* Clock.currentTimeMillis)
    const asOf = yield* seenWatermark
    const tests = yield* approvedTests({ game: gameId })
    const summary = summarize(tests, now)
    const follow = yield* visitorFollow(gameId)

    const pending = yield* oneRow(
      Count,
      sql`
        SELECT count(*)::int AS n
        FROM report r JOIN game_edition e ON e.id = r.edition_id
        WHERE e.game_id = ${gameId} AND r.review_status = 'pendiente'`,
    )

    const profileRows = yield* SqlSchema.findAll({
      Request: GameId,
      Result: ProfileRow,
      execute: (id) => sql`
        SELECT p.id, p.title, p.revision, p.distribution_id, p.architecture, p.ram_min_mb, p.vram_min_mb, p.requires_vulkan,
               p.vulkan_version_min, p.review_status, l.name AS launcher,
               ${sql.literal(distributionLabel('dist'))} AS distribution, ${sql.literal(layerLabel('vc'))} AS layer,
               ${sql.literal(isDemo('u'))} AS demo
        FROM profile p
        JOIN game_edition e ON e.id = p.edition_id
        JOIN launcher l ON l.id = e.launcher_id
        JOIN distribution dist ON dist.id = p.distribution_id
        JOIN layer_version vc ON vc.id = p.layer_version_id
        JOIN app_user u ON u.id = p.author_id
        WHERE e.game_id = ${id} AND p.review_status IN ${sql.in(activeStatuses)}
        ORDER BY p.review_status = 'aprobado' DESC, p.title, p.revision DESC`,
    })(gameId)

    const solutions = yield* SqlSchema.findAll({
      Request: GameId,
      Result: SolutionRow,
      execute: (id) => sql`
        SELECT s.id, s.title, s.instructions, tf.code, u.alias AS author, ${sql.literal(profileLabel('p'))} AS profile,
               ${sql.literal(isDemo('u'))} AS demo
        FROM solution s
        JOIN report r ON r.id = s.report_id
        JOIN game_edition e ON e.id = r.edition_id
        JOIN failure_type tf ON tf.id = s.failure_type_id
        JOIN app_user u ON u.id = s.author_id
        LEFT JOIN profile p ON p.id = s.profile_id
        WHERE e.game_id = ${id} AND s.review_status = 'aprobado' AND r.review_status = 'aprobado'
          AND (s.profile_id IS NULL OR p.review_status = 'aprobado')
        ORDER BY s.reviewed_at DESC, s.id`,
    })(gameId)
    const failureTypes = yield* SqlSchema.findAll({
      Request: Schema.Void,
      Result: FailureType.mapFields(Struct.pick(['id', 'code', 'description'])),
      execute: () => sql`SELECT id, code, description FROM failure_type`,
    })(undefined)
    const typeByCode = new Map(failureTypes.map((t) => [t.code, t]))
    const causes = summary.failures.map((f) => {
      const type = typeByCode.get(f.code)
      const report = tests.find((p) => p.failures.includes(f.code))
      return {
        ...f,
        description: type?.description ?? null,
        solutions: solutions.filter((s) => s.code === f.code),
        reply: type && report ? { report_id: report.report_id, failure_type_id: type.id } : null,
      }
    })

    const [protondb = null] = yield* protonDbSummaries(gameId)
    const diagnostic = yield* visitorDiagnostic
    const machine = Option.map(diagnostic, machineOnLinux)

    const profiles = profileRows.map(({ ram_min_mb, vram_min_mb, requires_vulkan, vulkan_version_min, ...p }) => ({
      ...p,
      evaluation:
        Option.isSome(machine) && p.review_status === 'aprobado'
          ? evaluate(machine.value, requirements({ ram_min_mb, vram_min_mb, requires_vulkan, vulkan_version_min }))
          : null,
    }))

    const personal = Option.match(Option.all({ d: diagnostic, machine }), {
      onNone: () => null,
      onSome: ({ d, machine }) => ({
        path: gamePath(machine, d.x86_level, { apis, x86_level_min: game.value.x86_level_min }),
        x86_level_min: game.value.x86_level_min,
        approximate: d.operating_system === 'Windows',
        on_my_distribution:
          d.distribution_id === null || d.distribution === null
            ? null
            : { name: d.distribution, summary: onDistribution(tests, d.distribution_id, now) },
        profile: suggestProfile(
          profiles.flatMap((p) => (p.evaluation === null ? [] : [{ ...p, evaluation: p.evaluation }])),
          d,
        ),
      }),
    })

    return {
      game: { ...game.value, apis },
      editions,
      summary,
      timeline: timeline(tests),
      as_of: asOf,
      follow: Option.match(follow, { onNone: () => null, onSome: ({ seen_at }) => ({ seen_at, news: newsSince(tests, seen_at, now) }) }),
      protondb,
      demo: tests.some((p) => p.demo),
      pending: pending.n,
      profiles,
      causes,
      diagnostic: Option.match(diagnostic, {
        onNone: () => null,
        onSome: (d) => ({ machine: d.machine, captured_at: d.captured_at, distribution_id: d.distribution_id }),
      }),
      personal,
    }
  })
