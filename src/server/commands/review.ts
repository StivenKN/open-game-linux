import { Array as Arr, Effect, Schema, Struct } from 'effect'
import { SqlClient, type SqlError } from 'effect/sql'
import { mismatches, TargetProfile } from '../../domain/contributions.ts'
import { ApprovalBlocked, type Unauthenticated, NotFound, RuleViolated, type Forbidden, InvalidTransition } from '../../domain/errors.ts'
import { DistributionId, UserId } from '../../domain/ids.ts'
import { WorkingOutcome } from '../../domain/literals.ts'
import { type ContributionRef, type Blocker, type Decision, targetOf, ReviewStatus, planTransition, type ContributionType } from '../../domain/review.ts'
import { Diagnostic, Report } from '../../domain/tables.ts'
import { exigirRevisor, type Visitante } from '../auth.ts'
import { filas, type Infra } from '../rows.ts'

type Lectura<A> = Effect.Effect<A, Infra, SqlClient.SqlClient>

const aprobado: ReviewStatus = 'aprobado'

type Revisable = {
  readonly tabla: string
  readonly bloquear: (sql: SqlClient.SqlClient, id: number) => Effect.Effect<ReadonlyArray<unknown>, SqlError.SqlError>
  readonly bloqueos: (id: number) => Lectura<ReadonlyArray<Blocker>>
}

const Hay = Schema.Struct({ hay: Schema.Boolean })
const EstadosSolucion = Schema.Struct({ reporte: ReviewStatus, perfil: Schema.NullOr(ReviewStatus) })
const PruebaDeReporte = Schema.Struct({
  ...Report.mapFields(Struct.pick(['edicion_id', 'version_capa_id', 'version_juego', 'perfil_id'])).fields,
  distribucion_id: DistributionId,
  arquitectura: Diagnostic.fields.arquitectura,
})

const revisables = {
  perfil: {
    tabla: 'perfil_configuracion',
    bloquear: (sql, id) => sql`SELECT estado_revision, autor_id FROM perfil_configuracion WHERE id = ${id} FOR UPDATE`,
    bloqueos: (id) =>
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient
        const [fila] = yield* filas(
          Hay,
          sql`SELECT EXISTS (SELECT 1 FROM reporte WHERE perfil_id = ${id} AND estado_revision = ${aprobado}
                AND resultado IN ${sql.in(WorkingOutcome.literals)} LIMIT 1 FOR SHARE) AS hay`,
        )
        return fila?.hay === true ? [] : ['perfil_sin_reporte_funcional_aprobado']
      }),
  },
  reporte: {
    tabla: 'reporte',
    bloquear: (sql, id) =>
      sql`SELECT r.estado_revision, e.usuario_id AS autor_id
          FROM reporte r JOIN diagnostico d ON d.id = r.diagnostico_id JOIN equipo e ON e.id = d.equipo_id
          WHERE r.id = ${id} FOR UPDATE OF r`,
    bloqueos: (id) =>
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient
        const [prueba] = yield* filas(
          PruebaDeReporte,
          sql`SELECT r.edicion_id, r.version_capa_id, r.version_juego, r.perfil_id, d.distribucion_id, d.arquitectura
              FROM reporte r JOIN diagnostico d ON d.id = r.diagnostico_id WHERE r.id = ${id}`,
        )
        if (prueba === undefined || prueba.perfil_id === null) return []
        const [perfil] = yield* filas(
          TargetProfile,
          sql`SELECT edicion_id, version_capa_id, distribucion_id, arquitectura, version_juego_objetivo
              FROM perfil_configuracion WHERE id = ${prueba.perfil_id}`,
        )
        return perfil !== undefined && mismatches(prueba, perfil).length > 0 ? ['reporte_incomparable'] : []
      }),
  },
  solucion: {
    tabla: 'solucion',
    bloquear: (sql, id) => sql`SELECT estado_revision, autor_id FROM solucion WHERE id = ${id} FOR UPDATE`,
    bloqueos: (id) =>
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient
        const [estados] = yield* filas(
          EstadosSolucion,
          sql`SELECT r.estado_revision AS reporte,
                     (SELECT p.estado_revision FROM perfil_configuracion p WHERE p.id = s.perfil_id FOR SHARE) AS perfil
              FROM solucion s JOIN reporte r ON r.id = s.reporte_id
              WHERE s.id = ${id} FOR SHARE OF r`,
        )
        if (estados === undefined) return []
        const bloqueos: Array<Blocker> = []
        if (estados.reporte !== aprobado) bloqueos.push('solucion_fallo_origen_no_aprobado')
        if (estados.perfil !== null && estados.perfil !== aprobado) bloqueos.push('solucion_perfil_no_aprobado')
        return bloqueos
      }),
  },
} as const satisfies Record<ContributionType, Revisable>

export const bloqueosAprobacion = (ref: ContributionRef): Lectura<ReadonlyArray<Blocker>> => revisables[ref._tag].bloqueos(ref.id)

const FilaRevisable = Schema.Struct({ estado_revision: ReviewStatus, autor_id: UserId })

export const decidir = (
  ref: ContributionRef,
  decision: Decision,
): Effect.Effect<
  { readonly cambio: boolean },
  RuleViolated | InvalidTransition | ApprovalBlocked | NotFound | Unauthenticated | Forbidden | Infra,
  SqlClient.SqlClient | Visitante
> =>
  Effect.gen(function* () {
    const revisor = yield* exigirRevisor
    const sql = yield* SqlClient.SqlClient
    const revisable = revisables[ref._tag]

    const [fila] = yield* filas(FilaRevisable, revisable.bloquear(sql, ref.id))
    if (fila === undefined) return yield* Effect.fail(new NotFound())
    if (fila.autor_id === revisor.id) return yield* Effect.fail(new RuleViolated({ rule: 'autorrevision' }))

    const destino = targetOf[decision._tag]
    const plan = planTransition(fila.estado_revision, decision)
    if (plan === 'sin_cambios') return { cambio: false }
    if (plan === 'transicion_invalida') return yield* Effect.fail(new InvalidTransition({ from: fila.estado_revision, to: destino }))

    if (decision._tag === 'Aprobar') {
      const bloqueos = yield* revisable.bloqueos(ref.id)
      if (Arr.isReadonlyArrayNonEmpty(bloqueos)) return yield* Effect.fail(new ApprovalBlocked({ blockers: bloqueos }))
    }

    const evidencia = decision._tag === 'Aprobar' ? decision.evidencia : null
    yield* sql`UPDATE ${sql(revisable.tabla)}
               SET estado_revision = ${destino}, revisor_id = ${revisor.id}, revisado_en = now(),
                   motivo_revision = ${decision.motivo}, evidencia_revision = COALESCE(${evidencia}, evidencia_revision)
               WHERE id = ${ref.id}`
    return { cambio: true }
  })
