import { Clock, Effect, Option, Schema, Struct } from 'effect'
import { SqlClient, SqlSchema } from 'effect/sql'
import { onDistribution, ApprovedTest, summarize } from '../../domain/compatibility.ts'
import { requirements, evaluate, suggestProfile } from '../../domain/evaluation.ts'
import { NotFound } from '../../domain/errors.ts'
import { GameId, UserId } from '../../domain/ids.ts'
import { GraphicsApi } from '../../domain/literals.ts'
import { ReviewStatus, activeStatuses } from '../../domain/review.ts'
import { gamePath } from '../../domain/graphics-path.ts'
import { Diagnostic, GameEdition, Machine, Game, GameApi, Launcher, Profile, Solution, FailureType } from '../../domain/tables.ts'
import { Visitor } from '../auth.ts'
import { rows, oneRow } from '../rows.ts'
import { machineOnLinux } from '../gpu/capability.ts'
import { isDemo, layerLabel, distributionLabel, profileLabel } from './labels.ts'
import { protonDbSummaries } from './protondb.ts'

const GameTest = Schema.Struct({ ...ApprovedTest.fields, juego_id: GameId, ejemplo: Schema.Boolean })

export const approvedTests = (game: GameId | null) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    return yield* rows(
      GameTest,
      sql`
      SELECT e.game_id, r.id AS report_id, r.review_status, r.edition_id, l.name AS launcher, r.game_version,
             d.distribution_id, ${sql.literal(distributionLabel('dist'))} AS distribution,
             r.layer_version_id, ${sql.literal(layerLabel('vc'))} AS layer,
             r.profile_id, ${sql.literal(profileLabel('p'))} AS profile,
             r.outcome, r.tested_at, r.avg_fps, r.resolution, r.graphics_quality, r.measurement_method,
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
      WHERE ${sql.and([sql`r.review_status = 'aprobado'`, ...(game === null ? [] : [sql`e.game_id = ${game}`])])}
      GROUP BY r.id, e.id, l.id, d.id, dist.id, u.id, vc.id, p.id
      ORDER BY r.tested_at DESC, r.id`,
    )
  })

const MyDiagnostic = Diagnostic.mapFields(
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
).mapFields(Struct.assign({ equipo: Machine.fields.alias, distribucion: Schema.NullOr(Schema.String) }))

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

const GameRow = Game.mapFields(Struct.pick(['id', 'titulo', 'descripcion', 'nivel_x86_min']))

const EditionRow = GameEdition.mapFields(Struct.pick(['id', 'identificador_externo'])).mapFields(
  Struct.assign({ lanzador: Launcher.fields.nombre }),
)

const ProfileRow = Profile.mapFields(
  Struct.pick(['id', 'titulo', 'revision', 'distribucion_id', 'arquitectura', 'ram_min_mb', 'vram_min_mb', 'requiere_vulkan', 'version_vulkan_min']),
).mapFields(
  Struct.assign({
    estado_revision: ReviewStatus.pick(activeStatuses),
    lanzador: Schema.String,
    distribucion: Schema.String,
    capa: Schema.String,
    ejemplo: Schema.Boolean,
  }),
)

const SolutionRow = Solution.mapFields(Struct.pick(['id', 'titulo', 'instrucciones'])).mapFields(
  Struct.assign({ codigo: FailureType.fields.codigo, autor: Schema.String, perfil: Schema.NullOr(Schema.String), ejemplo: Schema.Boolean }),
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
    const tests = yield* approvedTests(gameId)
    const summary = summarize(tests, now)

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
      Result: FailureType.mapFields(Struct.pick(['id', 'codigo', 'descripcion'])),
      execute: () => sql`SELECT id, code, description FROM failure_type`,
    })(undefined)
    const typeByCode = new Map(failureTypes.map((t) => [t.codigo, t]))
    const causes = summary.failures.map((f) => {
      const type = typeByCode.get(f.code)
      const report = tests.find((p) => p.fallos.includes(f.code))
      return {
        ...f,
        descripcion: type?.descripcion ?? null,
        solutions: solutions.filter((s) => s.codigo === f.code),
        reply: type && report ? { reporte_id: report.reporte_id, tipo_fallo_id: type.id } : null,
      }
    })

    const [protondb = null] = yield* protonDbSummaries(gameId)
    const diagnostic = yield* visitorDiagnostic
    const machine = Option.map(diagnostic, machineOnLinux)

    const profiles = profileRows.map(({ ram_min_mb, vram_min_mb, requiere_vulkan, version_vulkan_min, ...p }) => ({
      ...p,
      evaluation:
        Option.isSome(machine) && p.estado_revision === 'aprobado'
          ? evaluate(machine.value, requirements({ ram_min_mb, vram_min_mb, requiere_vulkan, version_vulkan_min }))
          : null,
    }))

    const personal = Option.match(Option.all({ d: diagnostic, machine }), {
      onNone: () => null,
      onSome: ({ d, machine }) => ({
        path: gamePath(machine, d.nivel_x86, { apis, nivel_x86_min: game.value.nivel_x86_min }),
        nivel_x86_min: game.value.nivel_x86_min,
        approximate: d.sistema === 'Windows',
        on_my_distribution:
          d.distribucion_id === null || d.distribucion === null
            ? null
            : { name: d.distribucion, summary: onDistribution(tests, d.distribucion_id, now) },
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
      protondb,
      ejemplo: tests.some((p) => p.ejemplo),
      pending: pending.n,
      profiles,
      causes,
      diagnostic: Option.match(diagnostic, {
        onNone: () => null,
        onSome: (d) => ({ equipo: d.equipo, capturado_en: d.capturado_en, distribucion_id: d.distribucion_id }),
      }),
      personal,
    }
  })
