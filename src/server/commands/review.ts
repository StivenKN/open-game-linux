import { Array as Arr, Effect, Schema, Struct } from 'effect'
import { SqlClient, type SqlError } from 'effect/sql'
import { mismatches, TargetProfile } from '../../domain/contributions.ts'
import { ApprovalBlocked, type Unauthenticated, NotFound, RuleViolated, type Forbidden, InvalidTransition } from '../../domain/errors.ts'
import { DistributionId, UserId } from '../../domain/ids.ts'
import { WorkingOutcome } from '../../domain/literals.ts'
import { type ContributionRef, type Blocker, type Decision, targetOf, ReviewStatus, planTransition, type ContributionType } from '../../domain/review.ts'
import { Diagnostic, Report } from '../../domain/tables.ts'
import { requireReviewer, type Visitor } from '../auth.ts'
import { rows, type Infra } from '../rows.ts'

type Read<A> = Effect.Effect<A, Infra, SqlClient.SqlClient>

const approved: ReviewStatus = 'aprobado'

type Reviewable = {
  readonly table: string
  readonly lock: (sql: SqlClient.SqlClient, id: number) => Effect.Effect<ReadonlyArray<unknown>, SqlError.SqlError>
  readonly blockers: (id: number) => Read<ReadonlyArray<Blocker>>
}

const Exists = Schema.Struct({ found: Schema.Boolean })
const SolutionStatuses = Schema.Struct({ report: ReviewStatus, profile: Schema.NullOr(ReviewStatus) })
const ReportTest = Schema.Struct({
  ...Report.mapFields(Struct.pick(['edition_id', 'layer_version_id', 'game_version', 'profile_id'])).fields,
  distribution_id: DistributionId,
  architecture: Diagnostic.fields.architecture,
})

const reviewables = {
  perfil: {
    table: 'profile',
    lock: (sql, id) => sql`SELECT review_status, author_id FROM profile WHERE id = ${id} FOR UPDATE`,
    blockers: (id) =>
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient
        const [row] = yield* rows(
          Exists,
          sql`SELECT EXISTS (SELECT 1 FROM report WHERE profile_id = ${id} AND review_status = ${approved}
                AND outcome IN ${sql.in(WorkingOutcome.literals)} LIMIT 1 FOR SHARE) AS found`,
        )
        return row?.found === true ? [] : ['perfil_sin_reporte_funcional_aprobado']
      }),
  },
  reporte: {
    table: 'report',
    lock: (sql, id) =>
      sql`SELECT r.review_status, e.user_id AS author_id
          FROM report r JOIN diagnostic d ON d.id = r.diagnostic_id JOIN machine e ON e.id = d.machine_id
          WHERE r.id = ${id} FOR UPDATE OF r`,
    blockers: (id) =>
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient
        const [test] = yield* rows(
          ReportTest,
          sql`SELECT r.edition_id, r.layer_version_id, r.game_version, r.profile_id, d.distribution_id, d.architecture
              FROM report r JOIN diagnostic d ON d.id = r.diagnostic_id WHERE r.id = ${id}`,
        )
        if (test === undefined || test.profile_id === null) return []
        const [profile] = yield* rows(
          TargetProfile,
          sql`SELECT edition_id, layer_version_id, distribution_id, architecture, target_game_version
              FROM profile WHERE id = ${test.profile_id}`,
        )
        return profile !== undefined && mismatches(test, profile).length > 0 ? ['reporte_incomparable'] : []
      }),
  },
  solucion: {
    table: 'solution',
    lock: (sql, id) => sql`SELECT review_status, author_id FROM solution WHERE id = ${id} FOR UPDATE`,
    blockers: (id) =>
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient
        const [statuses] = yield* rows(
          SolutionStatuses,
          sql`SELECT r.review_status AS report,
                     (SELECT p.review_status FROM profile p WHERE p.id = s.profile_id FOR SHARE) AS profile
              FROM solution s JOIN report r ON r.id = s.report_id
              WHERE s.id = ${id} FOR SHARE OF r`,
        )
        if (statuses === undefined) return []
        const blockers: Array<Blocker> = []
        if (statuses.report !== approved) blockers.push('solucion_fallo_origen_no_aprobado')
        if (statuses.profile !== null && statuses.profile !== approved) blockers.push('solucion_perfil_no_aprobado')
        return blockers
      }),
  },
} as const satisfies Record<ContributionType, Reviewable>

export const approvalBlockers = (ref: ContributionRef): Read<ReadonlyArray<Blocker>> => reviewables[ref._tag].blockers(ref.id)

const ReviewableRow = Schema.Struct({ review_status: ReviewStatus, author_id: UserId })

export const decide = (
  ref: ContributionRef,
  decision: Decision,
): Effect.Effect<
  { readonly changed: boolean },
  RuleViolated | InvalidTransition | ApprovalBlocked | NotFound | Unauthenticated | Forbidden | Infra,
  SqlClient.SqlClient | Visitor
> =>
  Effect.gen(function* () {
    const reviewer = yield* requireReviewer
    const sql = yield* SqlClient.SqlClient
    const reviewable = reviewables[ref._tag]

    const [row] = yield* rows(ReviewableRow, reviewable.lock(sql, ref.id))
    if (row === undefined) return yield* Effect.fail(new NotFound())
    if (row.author_id === reviewer.id) return yield* Effect.fail(new RuleViolated({ rule: 'autorrevision' }))

    const target = targetOf[decision._tag]
    const plan = planTransition(row.review_status, decision)
    if (plan === 'sin_cambios') return { changed: false }
    if (plan === 'transicion_invalida') return yield* Effect.fail(new InvalidTransition({ from: row.review_status, to: target }))

    if (decision._tag === 'Aprobar') {
      const blockers = yield* reviewable.blockers(ref.id)
      if (Arr.isReadonlyArrayNonEmpty(blockers)) return yield* Effect.fail(new ApprovalBlocked({ blockers }))
    }

    const evidence = decision._tag === 'Aprobar' ? decision.evidencia : null
    yield* sql`UPDATE ${sql(reviewable.table)}
               SET review_status = ${target}, reviewer_id = ${reviewer.id}, reviewed_at = now(),
                   review_reason = ${decision.motivo}, review_evidence = COALESCE(${evidence}, review_evidence)
               WHERE id = ${ref.id}`
    return { changed: true }
  })
