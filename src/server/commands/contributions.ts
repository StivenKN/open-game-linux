import { Array as Arr, Effect, Schema, Struct } from 'effect'
import { SqlClient } from 'effect/sql'
import { mismatches, type NewSolution, type NewGame, type NewReport, TargetProfile } from '../../domain/contributions.ts'
import { type Unauthenticated, IncomparableProfile, type Rule, RuleViolated, type Forbidden } from '../../domain/errors.ts'
import { GameId, ReportId, SolutionId, LayerVersionId } from '../../domain/ids.ts'
import { activeStatuses } from '../../domain/review.ts'
import { Diagnostic, Machine, Profile, Report } from '../../domain/tables.ts'
import { requireReviewer, requireUser, type Visitor } from '../auth.ts'
import { withDbRules } from '../schema/constraints.ts'
import { rows, type Infra, oneRow } from '../rows.ts'

export type Write<A, E> = Effect.Effect<A, E | Unauthenticated | Infra, SqlClient.SqlClient | Visitor>

const violate = (rule: Rule) => Effect.fail(new RuleViolated({ rule }))

const ReportDiagnostic = Schema.Struct({
  user_id: Machine.fields.user_id,
  ...Diagnostic.mapFields(Struct.pick(['operating_system', 'distribution_id', 'architecture', 'captured_at'])).fields,
})

const ReportIdRow = Schema.Struct({ id: ReportId })

export const submitReport = (n: NewReport): Write<{ readonly id: ReportId }, RuleViolated | IncomparableProfile> =>
  Effect.gen(function* () {
    const user = yield* requireUser
    const sql = yield* SqlClient.SqlClient

    const [d] = yield* rows(
      ReportDiagnostic,
      sql`SELECT e.user_id, d.operating_system, d.distribution_id, d.architecture, d.captured_at
          FROM diagnostic d JOIN machine e ON e.id = d.machine_id WHERE d.id = ${n.diagnostic_id}`,
    )
    if (d === undefined || d.user_id !== user.id) return yield* violate('equipo_ajeno')
    if (d.operating_system !== 'Linux' || d.distribution_id === null) return yield* violate('diagnostico_no_linux')
    if (n.tested_at < d.captured_at) return yield* violate('fecha_antes_del_diagnostico')

    const layer_version_id = yield* resolveLayerVersion(n.layer_version)

    if (n.profile_id !== null) {
      const [profile] = yield* rows(
        TargetProfile,
        sql`SELECT edition_id, layer_version_id, distribution_id, architecture, target_game_version
            FROM profile WHERE id = ${n.profile_id} AND review_status IN ${sql.in(activeStatuses)}`,
      )
      if (profile === undefined) return yield* violate('perfil_no_disponible')
      const found = mismatches(
        { edition_id: n.edition_id, layer_version_id, distribution_id: d.distribution_id, architecture: d.architecture, game_version: n.game_version },
        profile,
      )
      if (Arr.isReadonlyArrayNonEmpty(found)) return yield* Effect.fail(new IncomparableProfile({ mismatches: found }))
    }

    const created = yield* oneRow(
      ReportIdRow,
      sql`INSERT INTO report ${sql.insert({
        edition_id: n.edition_id,
        diagnostic_id: n.diagnostic_id,
        layer_version_id,
        profile_id: n.profile_id,
        game_version: n.game_version,
        launcher_version: n.launcher_version,
        tested_at: n.tested_at,
        outcome: n.outcome,
        avg_fps: n.measurement?.avg_fps ?? null,
        resolution: n.measurement?.resolution ?? null,
        graphics_quality: n.measurement?.graphics_quality ?? null,
        measurement_method: n.measurement?.measurement_method ?? null,
        observations: n.observations,
      })} RETURNING id`,
    )
    if (Arr.isReadonlyArrayNonEmpty(n.failures))
      yield* withDbRules(sql`INSERT INTO report_failure ${sql.insert(n.failures.map((f) => ({ report_id: created.id, ...f })))}`)
    return { id: created.id }
  })

const LayerVersionIdRow = Schema.Struct({ id: LayerVersionId })

const resolveLayerVersion = (ref: NewReport['layer_version']) =>
  Effect.gen(function* () {
    if (ref._tag === 'existente') return ref.id
    const sql = yield* SqlClient.SqlClient
    // DO UPDATE instead of DO NOTHING so RETURNING also yields the id of a row that already existed.
    const layer = yield* withDbRules(
      oneRow(
        LayerVersionIdRow,
        sql`INSERT INTO layer_version (family, variant, version) VALUES (${ref.family}, ${ref.variant}, ${ref.version})
            ON CONFLICT ON CONSTRAINT layer_version_uq DO UPDATE SET family = EXCLUDED.family RETURNING id`,
      ),
    )
    return layer.id
  })

const SolutionOrigin = Report.mapFields(Struct.pick(['edition_id']))
const RecommendedProfile = Profile.mapFields(Struct.pick(['edition_id']))
const SolutionIdRow = Schema.Struct({ id: SolutionId })

export const submitSolution = (s: NewSolution): Write<{ readonly id: SolutionId }, RuleViolated> =>
  Effect.gen(function* () {
    const user = yield* requireUser
    const sql = yield* SqlClient.SqlClient

    const [origin] = yield* rows(
      SolutionOrigin,
      sql`SELECT r.edition_id FROM report_failure f JOIN report r ON r.id = f.report_id
          WHERE f.report_id = ${s.report_id} AND f.failure_type_id = ${s.failure_type_id} AND r.review_status IN ${sql.in(activeStatuses)}`,
    )
    if (origin === undefined) return yield* violate('solucion_sin_fallo')

    if (s.profile_id !== null) {
      const [profile] = yield* rows(
        RecommendedProfile,
        sql`SELECT edition_id FROM profile WHERE id = ${s.profile_id} AND review_status IN ${sql.in(activeStatuses)}`,
      )
      if (profile === undefined) return yield* violate('perfil_no_disponible')
      if (profile.edition_id !== origin.edition_id) return yield* violate('solucion_perfil_otra_edicion')
    }

    const created = yield* oneRow(
      SolutionIdRow,
      sql`INSERT INTO solution ${sql.insert({
        report_id: s.report_id,
        failure_type_id: s.failure_type_id,
        author_id: user.id,
        profile_id: s.profile_id,
        title: s.title,
        instructions: s.instructions,
      })} RETURNING id`,
    )
    return { id: created.id }
  })

const GameIdRow = Schema.Struct({ id: GameId })

export const createGame = (j: NewGame): Write<{ readonly id: GameId }, RuleViolated | Forbidden> =>
  Effect.gen(function* () {
    yield* requireReviewer
    const sql = yield* SqlClient.SqlClient
    const created = yield* oneRow(
      GameIdRow,
      sql`INSERT INTO game ${sql.insert({ title: j.title, description: j.description, x86_level_min: j.x86_level_min })} RETURNING id`,
    )
    yield* withDbRules(sql`INSERT INTO game_edition ${sql.insert(j.editions.map((e) => ({ game_id: created.id, ...e })))}`)
    yield* sql`INSERT INTO game_api ${sql.insert(Arr.dedupe(j.apis).map((api) => ({ game_id: created.id, api })))}`
    return { id: created.id }
  })
