import { Array as Arr, Effect, Schema, Struct } from 'effect'
import { SqlClient } from 'effect/sql'
import {
  type DependencyRef,
  mismatches,
  type NewGuide,
  type NewProfile,
  type NewSolution,
  type NewGame,
  type NewReport,
  type GuideEdit,
  type ProfileContent,
  profileContentColumns,
  type ProfileEdit,
  TargetProfile,
} from '../../domain/contributions.ts'
import { type Unauthenticated, IncomparableProfile, NotFound, type Rule, RuleViolated, type Forbidden } from '../../domain/errors.ts'
import { DependencyId, GameId, GuideId, ProfileId, ReportId, SolutionId, LayerVersionId, UserId } from '../../domain/ids.ts'
import { activeStatuses, type ReviewStatus } from '../../domain/review.ts'
import { Diagnostic, Machine, Profile, Report } from '../../domain/tables.ts'
import { requireReviewer, requireUser, type Visitor } from '../auth.ts'
import { withDbRules } from '../schema/constraints.ts'
import { rows, type Infra, oneRow } from '../rows.ts'
import { fulfillRequest } from './game-requests.ts'

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

/** Started from a request (`request_id`), the same transaction fulfils it, or fails if it already closed. */
export const createGame = (j: NewGame): Write<{ readonly id: GameId }, RuleViolated | Forbidden | NotFound> =>
  Effect.gen(function* () {
    const reviewer = yield* requireReviewer
    const sql = yield* SqlClient.SqlClient
    const created = yield* oneRow(
      GameIdRow,
      sql`INSERT INTO game ${sql.insert({ title: j.title, description: j.description, x86_level_min: j.x86_level_min })} RETURNING id`,
    )
    yield* withDbRules(sql`INSERT INTO game_edition ${sql.insert(j.editions.map((e) => ({ game_id: created.id, ...e })))}`)
    yield* sql`INSERT INTO game_api ${sql.insert(Arr.dedupe(j.apis).map((api) => ({ game_id: created.id, api })))}`
    if (j.request_id !== null) yield* fulfillRequest(reviewer, j.request_id, created.id)
    return { id: created.id }
  })

const pending: ReviewStatus = 'pendiente'

/**
 * SQL over the profile alias `p`: its author may still change or delete it. Only while it is pending
 * and no report or solution points at it, because a test or a recommendation is about this exact content.
 * The profile page reads the same expression to offer «Editar».
 */
export const profileEditable = (p: string) =>
  `${p}.review_status = '${pending}' AND NOT EXISTS (SELECT 1 FROM report r WHERE r.profile_id = ${p}.id)
   AND NOT EXISTS (SELECT 1 FROM solution s WHERE s.profile_id = ${p}.id)`

const ProfileIdRow = Schema.Struct({ id: ProfileId })
const NextRevision = Schema.Struct({ revision: Profile.fields.revision })
const DependencyIdRow = Schema.Struct({ id: DependencyId })
const Author = Schema.Struct({ author_id: UserId })
const Editable = Schema.Struct({ editable: Schema.Boolean })
const ProfileGame = Schema.Struct({ game_id: GameId })

const contentColumns = (c: ProfileContent) => Struct.pick(c, profileContentColumns)

const resolveDependency = (ref: DependencyRef) =>
  Effect.gen(function* () {
    if (ref._tag === 'existente') return ref.id
    const sql = yield* SqlClient.SqlClient
    // As in resolveLayerVersion: a name the catalog already has keeps its row and its description.
    const dependency = yield* oneRow(
      DependencyIdRow,
      sql`INSERT INTO dependency ${sql.insert({ name: ref.name, package_manager: ref.package_manager, description: ref.description })}
          ON CONFLICT ON CONSTRAINT dependency_name_package_manager_uq DO UPDATE SET name = EXCLUDED.name RETURNING id`,
    )
    return dependency.id
  })

const insertStepsAndDependencies = (profile_id: ProfileId, c: ProfileContent) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* withDbRules(sql`INSERT INTO profile_step ${sql.insert(c.steps.map((s, i) => ({ profile_id, position: i + 1, ...s })))}`)
    const dependencies = yield* Effect.forEach(c.dependencies, ({ dependency, ...d }) =>
      Effect.map(resolveDependency(dependency), (dependency_id) => ({ profile_id, dependency_id, ...d })),
    )
    if (Arr.isReadonlyArrayNonEmpty(dependencies)) yield* withDbRules(sql`INSERT INTO profile_dependency ${sql.insert(dependencies)}`)
  })

/** A new profile is pending and takes the next revision of its environment (edition, distribution, layer, architecture). */
export const proposeProfile = (p: NewProfile): Write<{ readonly id: ProfileId }, RuleViolated> =>
  Effect.gen(function* () {
    const user = yield* requireUser
    const sql = yield* SqlClient.SqlClient
    const layer_version_id = yield* resolveLayerVersion(p.layer_version)
    // Two proposals for one environment at the same instant collide on profile_revision_uq; the second can resend.
    const { revision } = yield* oneRow(
      NextRevision,
      sql`SELECT COALESCE(max(revision), 0) + 1 AS revision FROM profile
          WHERE edition_id = ${p.edition_id} AND distribution_id = ${p.distribution_id}
            AND layer_version_id = ${layer_version_id} AND architecture = ${p.architecture}`,
    )
    const created = yield* oneRow(
      ProfileIdRow,
      sql`INSERT INTO profile ${sql.insert({
        edition_id: p.edition_id,
        distribution_id: p.distribution_id,
        layer_version_id,
        architecture: p.architecture,
        author_id: user.id,
        revision,
        ...contentColumns(p),
      })} RETURNING id`,
    )
    yield* insertStepsAndDependencies(created.id, p)
    return { id: created.id }
  })

/** Locks the visitor's own profile; someone else's is NotFound, and a used or reviewed one is frozen. */
const lockEditable = (id: ProfileId) =>
  Effect.gen(function* () {
    const user = yield* requireUser
    const sql = yield* SqlClient.SqlClient
    const [row] = yield* rows(Author, sql`SELECT author_id FROM profile WHERE id = ${id} FOR UPDATE`)
    if (row === undefined || row.author_id !== user.id) return yield* Effect.fail(new NotFound())
    // A second statement: it reads after the lock wait, so it sees a report or solution saved meanwhile.
    const { editable } = yield* oneRow(Editable, sql`SELECT ${sql.literal(profileEditable('p'))} AS editable FROM profile p WHERE p.id = ${id}`)
    if (!editable) return yield* violate('perfil_congelado')
  })

/** Replaces the content, steps and dependencies of the author's pending, unused profile. */
export const editProfile = (p: ProfileEdit): Write<{ readonly id: ProfileId }, RuleViolated | NotFound> =>
  Effect.gen(function* () {
    yield* lockEditable(p.profile_id)
    const sql = yield* SqlClient.SqlClient
    yield* withDbRules(sql`UPDATE profile SET ${sql.update(contentColumns(p))} WHERE id = ${p.profile_id}`)
    yield* withDbRules(sql`DELETE FROM profile_step WHERE profile_id = ${p.profile_id}`)
    yield* withDbRules(sql`DELETE FROM profile_dependency WHERE profile_id = ${p.profile_id}`)
    yield* insertStepsAndDependencies(p.profile_id, p)
    return { id: p.profile_id }
  })

/** The author's way back: a pending profile nobody used is evidence of nothing, so it goes with its steps. */
export const deleteProfile = (id: ProfileId): Write<{ readonly game_id: GameId }, RuleViolated | NotFound> =>
  Effect.gen(function* () {
    yield* lockEditable(id)
    const sql = yield* SqlClient.SqlClient
    return yield* withDbRules(
      oneRow(ProfileGame, sql`DELETE FROM profile p USING game_edition e WHERE p.id = ${id} AND e.id = p.edition_id RETURNING e.game_id`),
    )
  })

const GuideIdRow = Schema.Struct({ id: GuideId })

/** Only reviewers write guides ("Solo revisores publican guías"); the author is the reviewer who created it. */
export const createGuide = (g: NewGuide): Write<{ readonly id: GuideId }, Forbidden> =>
  Effect.gen(function* () {
    const reviewer = yield* requireReviewer
    const sql = yield* SqlClient.SqlClient
    return yield* oneRow(GuideIdRow, sql`INSERT INTO adoption_guide ${sql.insert({ ...g, author_id: reviewer.id, revision: 1 })} RETURNING id`)
  })

/** Any reviewer edits any guide. A change readers can see is a new revision; publishing or archiving is not. */
export const editGuide = ({ guide_id, status, ...text }: GuideEdit): Write<{ readonly id: GuideId }, Forbidden | NotFound> =>
  Effect.gen(function* () {
    yield* requireReviewer
    const sql = yield* SqlClient.SqlClient
    const found = yield* rows(GuideIdRow, sql`UPDATE adoption_guide SET status = ${status} WHERE id = ${guide_id} RETURNING id`)
    if (found.length === 0) return yield* Effect.fail(new NotFound())
    yield* sql`UPDATE adoption_guide SET ${sql.update(text)}, revision = revision + 1, updated_at = now()
               WHERE id = ${guide_id} AND (type, distribution_id, title, content) IS DISTINCT FROM (${text.type}, ${text.distribution_id}, ${text.title}, ${text.content})`
    return { id: guide_id }
  })
