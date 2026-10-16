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

const Exists = Schema.Struct({ hay: Schema.Boolean })
const SolutionStatuses = Schema.Struct({ reporte: ReviewStatus, perfil: Schema.NullOr(ReviewStatus) })
const ReportTest = Schema.Struct({
  ...Report.mapFields(Struct.pick(['edicion_id', 'version_capa_id', 'version_juego', 'perfil_id'])).fields,
  distribucion_id: DistributionId,
  arquitectura: Diagnostic.fields.arquitectura,
})

const reviewables = {
  perfil: {
    table: 'perfil_configuracion',
    lock: (sql, id) => sql`SELECT estado_revision, autor_id FROM perfil_configuracion WHERE id = ${id} FOR UPDATE`,
    blockers: (id) =>
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient
        const [row] = yield* rows(
          Exists,
          sql`SELECT EXISTS (SELECT 1 FROM reporte WHERE perfil_id = ${id} AND estado_revision = ${approved}
                AND resultado IN ${sql.in(WorkingOutcome.literals)} LIMIT 1 FOR SHARE) AS hay`,
        )
        return row?.hay === true ? [] : ['perfil_sin_reporte_funcional_aprobado']
      }),
  },
  reporte: {
    table: 'reporte',
    lock: (sql, id) =>
      sql`SELECT r.estado_revision, e.usuario_id AS autor_id
          FROM reporte r JOIN diagnostico d ON d.id = r.diagnostico_id JOIN equipo e ON e.id = d.equipo_id
          WHERE r.id = ${id} FOR UPDATE OF r`,
    blockers: (id) =>
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient
        const [test] = yield* rows(
          ReportTest,
          sql`SELECT r.edicion_id, r.version_capa_id, r.version_juego, r.perfil_id, d.distribucion_id, d.arquitectura
              FROM reporte r JOIN diagnostico d ON d.id = r.diagnostico_id WHERE r.id = ${id}`,
        )
        if (test === undefined || test.perfil_id === null) return []
        const [profile] = yield* rows(
          TargetProfile,
          sql`SELECT edicion_id, version_capa_id, distribucion_id, arquitectura, version_juego_objetivo
              FROM perfil_configuracion WHERE id = ${test.perfil_id}`,
        )
        return profile !== undefined && mismatches(test, profile).length > 0 ? ['reporte_incomparable'] : []
      }),
  },
  solucion: {
    table: 'solucion',
    lock: (sql, id) => sql`SELECT estado_revision, autor_id FROM solucion WHERE id = ${id} FOR UPDATE`,
    blockers: (id) =>
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient
        const [statuses] = yield* rows(
          SolutionStatuses,
          sql`SELECT r.estado_revision AS reporte,
                     (SELECT p.estado_revision FROM perfil_configuracion p WHERE p.id = s.perfil_id FOR SHARE) AS perfil
              FROM solucion s JOIN reporte r ON r.id = s.reporte_id
              WHERE s.id = ${id} FOR SHARE OF r`,
        )
        if (statuses === undefined) return []
        const blockers: Array<Blocker> = []
        if (statuses.reporte !== approved) blockers.push('solucion_fallo_origen_no_aprobado')
        if (statuses.perfil !== null && statuses.perfil !== approved) blockers.push('solucion_perfil_no_aprobado')
        return blockers
      }),
  },
} as const satisfies Record<ContributionType, Reviewable>

export const approvalBlockers = (ref: ContributionRef): Read<ReadonlyArray<Blocker>> => reviewables[ref._tag].blockers(ref.id)

const ReviewableRow = Schema.Struct({ estado_revision: ReviewStatus, autor_id: UserId })

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
    if (row.autor_id === reviewer.id) return yield* Effect.fail(new RuleViolated({ rule: 'autorrevision' }))

    const target = targetOf[decision._tag]
    const plan = planTransition(row.estado_revision, decision)
    if (plan === 'sin_cambios') return { changed: false }
    if (plan === 'transicion_invalida') return yield* Effect.fail(new InvalidTransition({ from: row.estado_revision, to: target }))

    if (decision._tag === 'Aprobar') {
      const blockers = yield* reviewable.blockers(ref.id)
      if (Arr.isReadonlyArrayNonEmpty(blockers)) return yield* Effect.fail(new ApprovalBlocked({ blockers }))
    }

    const evidence = decision._tag === 'Aprobar' ? decision.evidencia : null
    yield* sql`UPDATE ${sql(reviewable.table)}
               SET estado_revision = ${target}, revisor_id = ${reviewer.id}, revisado_en = now(),
                   motivo_revision = ${decision.motivo}, evidencia_revision = COALESCE(${evidence}, evidencia_revision)
               WHERE id = ${ref.id}`
    return { changed: true }
  })
