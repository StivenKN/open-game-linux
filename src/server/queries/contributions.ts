import { Effect, Schema, Struct } from 'effect'
import { SqlClient } from 'effect/sql'
import { RequiredText, type UserId } from '../../domain/ids.ts'
import { activeStatuses, ReviewStatus } from '../../domain/review.ts'
import { FailureType, Game, LayerVersion, Launcher, Profile, Report, Solution } from '../../domain/tables.ts'
import { protonReportPossible } from '../../domain/upstream.ts'
import { requireUser } from '../auth.ts'
import { profileEditable } from '../commands/contributions.ts'
import { rows } from '../rows.ts'
import { myMachines } from './diagnostic.ts'
import { distributionLabel, isDemo, layerLabel } from './labels.ts'

/**
 * A review as its author sees it. The reason travels only when it explains a refusal (decoding drops it
 * from the active member), and the reviewer never does: no page names who reviewed what.
 */
const AuthorReview = Schema.Union([
  Schema.Struct({ status: ReviewStatus.pick(activeStatuses) }),
  Schema.Struct({ status: ReviewStatus.pick(['rechazado', 'retirado']), reason: RequiredText }),
])

const reviewOf = (t: string) => `json_build_object('status', ${t}.review_status, 'reason', ${t}.review_reason)`

const Common = { review: AuthorReview, game_id: Game.fields.id, game: Game.fields.title }

const MyReport = Schema.Struct({
  ...Report.mapFields(Struct.pick(['id', 'created_at', 'outcome', 'tested_at', 'game_version'])).fields,
  ...LayerVersion.mapFields(Struct.pick(['family', 'variant'])).fields,
  ...Common,
  launcher: Launcher.fields.name,
  layer: Schema.String,
  distribution: Schema.String,
})

const MySolution = Schema.Struct({
  ...Solution.mapFields(Struct.pick(['id', 'created_at', 'title'])).fields,
  ...Common,
  failure_type: FailureType.fields.code,
})

const MyProfile = Schema.Struct({
  ...Profile.mapFields(Struct.pick(['id', 'created_at', 'title', 'revision'])).fields,
  ...Common,
  // Pending and unused: its author may still edit or delete it.
  editable: Schema.Boolean,
})

const reports = (user: UserId) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const mine = yield* rows(
      MyReport,
      sql`SELECT r.id, r.created_at, r.outcome, r.tested_at, r.game_version, vc.family, vc.variant,
                 ${sql.literal(reviewOf('r'))} AS review, j.id AS game_id, j.title AS game, l.name AS launcher,
                 ${sql.literal(layerLabel('vc'))} AS layer, ${sql.literal(distributionLabel('di'))} AS distribution
          FROM report r
          JOIN diagnostic d ON d.id = r.diagnostic_id
          JOIN machine eq ON eq.id = d.machine_id
          JOIN distribution di ON di.id = d.distribution_id
          JOIN game_edition e ON e.id = r.edition_id
          JOIN game j ON j.id = e.game_id
          JOIN launcher l ON l.id = e.launcher_id
          JOIN layer_version vc ON vc.id = r.layer_version_id
          WHERE eq.user_id = ${user}
          ORDER BY r.created_at DESC, r.id DESC`,
    )
    return mine.map(({ family, variant, ...r }) => {
      // /reportes/$reportId/proton answers only for an active report.
      const active = r.review.status === 'pendiente' || r.review.status === 'aprobado'
      return { ...r, valve: active && protonReportPossible({ ...r, family, variant }) }
    })
  })

const solutions = (user: UserId) =>
  Effect.flatMap(SqlClient.SqlClient, (sql) =>
    rows(
      MySolution,
      sql`SELECT s.id, s.created_at, s.title, ${sql.literal(reviewOf('s'))} AS review, j.id AS game_id, j.title AS game, t.code AS failure_type
          FROM solution s
          JOIN report r ON r.id = s.report_id
          JOIN game_edition e ON e.id = r.edition_id
          JOIN game j ON j.id = e.game_id
          JOIN failure_type t ON t.id = s.failure_type_id
          WHERE s.author_id = ${user}
          ORDER BY s.created_at DESC, s.id DESC`,
    ),
  )

const profiles = (user: UserId) =>
  Effect.flatMap(SqlClient.SqlClient, (sql) =>
    rows(
      MyProfile,
      sql`SELECT p.id, p.created_at, p.title, p.revision, ${sql.literal(reviewOf('p'))} AS review, j.id AS game_id, j.title AS game,
                 ${sql.literal(profileEditable('p'))} AS editable
          FROM profile p
          JOIN game_edition e ON e.id = p.edition_id
          JOIN game j ON j.id = e.game_id
          WHERE p.author_id = ${user}
          ORDER BY p.created_at DESC, p.id DESC`,
    ),
  )

const Demo = Schema.Struct({ demo: Schema.Boolean })

/**
 * /mis-aportes: everything the visitor wrote, in every review state, newest first. One query per kind,
 * so a new kind of contribution is one more query and one more key.
 */
export const myContributions = Effect.gen(function* () {
  const user = yield* requireUser
  const sql = yield* SqlClient.SqlClient
  const [account] = yield* rows(Demo, sql`SELECT ${sql.literal(isDemo('u'))} AS demo FROM app_user u WHERE u.id = ${user.id}`)
  return {
    demo: account?.demo ?? false,
    reports: yield* reports(user.id),
    solutions: yield* solutions(user.id),
    profiles: yield* profiles(user.id),
    machines: yield* myMachines(),
  }
})
