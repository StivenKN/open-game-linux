import { Effect, Schema, Struct } from 'effect'
import { SqlClient } from 'effect/sql'
import { profileContentColumns, TargetProfile } from '../../domain/contributions.ts'
import { NotFound } from '../../domain/errors.ts'
import { DiagnosticId, DistributionId, EditionId, type GameId, type GameRequestId, type GuideId, type ProfileId, type ReportId } from '../../domain/ids.ts'
import { activeStatuses } from '../../domain/review.ts'
import {
  AdoptionGuide,
  Dependency,
  Diagnostic,
  Distribution,
  Machine,
  Game,
  GameRequest,
  Launcher,
  Profile,
  ProfileDependency,
  ProfileStep,
  Report,
  FailureType,
  LayerVersion,
} from '../../domain/tables.ts'
import { profileEditable } from '../commands/contributions.ts'
import { requireReviewer, requireUser } from '../auth.ts'
import { oneRow, rows } from '../rows.ts'
import { layerLabel, distributionLabel } from './labels.ts'

const GameRow = Game.mapFields(Struct.pick(['id', 'title']))
const EditionRow = Schema.Struct({ id: EditionId, launcher: Launcher.fields.name })
const Name = Schema.String

const DiagnosticRow = Schema.Struct({
  id: DiagnosticId,
  machine: Machine.fields.alias,
  distribution: Name,
  distribution_id: DistributionId,
  ...Diagnostic.mapFields(Struct.pick(['architecture', 'captured_at'])).fields,
})

const ProfileRow = Schema.Struct({
  ...Profile.mapFields(Struct.pick(['id', 'title', 'revision', 'review_status'])).fields,
  ...TargetProfile.fields,
  distribution: Name,
})

export const reportOptions = (gameId: GameId, profile: ProfileId | null) =>
  Effect.gen(function* () {
    const user = yield* requireUser
    const sql = yield* SqlClient.SqlClient
    const [game] = yield* rows(GameRow, sql`SELECT id, title FROM game WHERE id = ${gameId}`)
    if (game === undefined) return yield* Effect.fail(new NotFound())

    const editions = yield* rows(
      EditionRow,
      sql`SELECT e.id, l.name AS launcher FROM game_edition e JOIN launcher l ON l.id = e.launcher_id
          WHERE e.game_id = ${gameId} ORDER BY l.name`,
    )
    const diagnostics = yield* rows(
      DiagnosticRow,
      sql`SELECT d.id, eq.alias AS machine, ${sql.literal(distributionLabel('di'))} AS distribution, d.distribution_id, d.architecture, d.captured_at
          FROM diagnostic d JOIN machine eq ON eq.id = d.machine_id JOIN distribution di ON di.id = d.distribution_id
          WHERE eq.user_id = ${user.id} ORDER BY d.captured_at DESC`,
    )
    const layers = yield* rows(LayerVersion, sql`SELECT id, family, variant, version FROM layer_version ORDER BY family, variant, version`)
    const profiles = yield* rows(
      ProfileRow,
      sql`SELECT p.id, p.title, p.revision, p.review_status, p.edition_id, p.layer_version_id, p.distribution_id, p.architecture,
                 p.target_game_version, ${sql.literal(distributionLabel('di'))} AS distribution
          FROM profile p JOIN game_edition e ON e.id = p.edition_id JOIN distribution di ON di.id = p.distribution_id
          WHERE e.game_id = ${gameId} AND p.review_status IN ${sql.in(activeStatuses)} ORDER BY p.title, p.revision`,
    )
    const failureTypes = yield* rows(FailureType, sql`SELECT id, code, description FROM failure_type ORDER BY id`)
    return { game, editions, diagnostics, layers, profiles, failureTypes, selectedProfile: profiles.find((p) => p.id === profile)?.id ?? null }
  })

const SourceReport = Schema.Struct({
  ...Report.mapFields(Struct.pick(['id', 'edition_id', 'outcome', 'game_version', 'tested_at', 'observations', 'review_status'])).fields,
  game_id: Game.fields.id,
  game: Game.fields.title,
  launcher: Launcher.fields.name,
  distribution: Name,
  layer: Name,
})
const SourceFailure = Schema.Struct({ failure_type_id: FailureType.fields.id, code: FailureType.fields.code, detail: Schema.String })
const EditionProfile = Profile.mapFields(Struct.pick(['id', 'title', 'revision', 'review_status']))

export const solutionOptions = (reportId: ReportId) =>
  Effect.gen(function* () {
    yield* requireUser
    const sql = yield* SqlClient.SqlClient
    const [report] = yield* rows(
      SourceReport,
      sql`SELECT r.id, r.edition_id, r.outcome, r.game_version, r.tested_at, r.observations, r.review_status,
                 j.id AS game_id, j.title AS game, l.name AS launcher, ${sql.literal(distributionLabel('di'))} AS distribution,
                 ${sql.literal(layerLabel('c'))} AS layer
          FROM report r JOIN game_edition e ON e.id = r.edition_id JOIN game j ON j.id = e.game_id JOIN launcher l ON l.id = e.launcher_id
            JOIN diagnostic d ON d.id = r.diagnostic_id JOIN distribution di ON di.id = d.distribution_id
            JOIN layer_version c ON c.id = r.layer_version_id
          WHERE r.id = ${reportId} AND r.review_status IN ${sql.in(activeStatuses)}`,
    )
    if (report === undefined) return yield* Effect.fail(new NotFound())
    const failures = yield* rows(
      SourceFailure,
      sql`SELECT f.failure_type_id, t.code, f.detail FROM report_failure f JOIN failure_type t ON t.id = f.failure_type_id
          WHERE f.report_id = ${reportId} ORDER BY t.id`,
    )
    if (failures.length === 0) return yield* Effect.fail(new NotFound())
    const profiles = yield* rows(
      EditionProfile,
      sql`SELECT id, title, revision, review_status FROM profile
          WHERE edition_id = ${report.edition_id} AND review_status IN ${sql.in(activeStatuses)} ORDER BY title, revision`,
    )
    return { report, failures, profiles }
  })

const LauncherRow = Launcher.mapFields(Struct.pick(['id', 'name']))
const RequestRow = GameRequest.mapFields(Struct.pick(['id', 'title', 'steam_app_id']))

/** The new-game form's launchers, and the open request it starts from (`?pedido=`); null once that request closed. */
export const gameOptions = (requestId: GameRequestId | null) =>
  Effect.gen(function* () {
    yield* requireReviewer
    const sql = yield* SqlClient.SqlClient
    const launchers = yield* rows(LauncherRow, sql`SELECT id, name FROM launcher ORDER BY name`)
    const [request] = requestId === null ? [] : yield* rows(RequestRow, sql`SELECT id, title, steam_app_id FROM game_request WHERE id = ${requestId} AND status = 'abierto'`)
    return { launchers, request: request ?? null }
  })

const DistributionOption = Schema.Struct({ id: Distribution.fields.id, name: Name })
const DependencyOption = Dependency.mapFields(Struct.pick(['id', 'name', 'package_manager']))

const distributionOptions = Effect.flatMap(SqlClient.SqlClient, (sql) =>
  rows(DistributionOption, sql`SELECT d.id, ${sql.literal(distributionLabel('d'))} AS name FROM distribution d ORDER BY d.name, d.version`),
)

const dependencyOptions = Effect.flatMap(SqlClient.SqlClient, (sql) =>
  rows(DependencyOption, sql`SELECT id, name, package_manager FROM dependency ORDER BY name, package_manager`),
)

const contentColumns = profileContentColumns.map((c) => `p.${c}`).join(', ')

const DraftContent = Profile.mapFields(Struct.pick(profileContentColumns))
const DraftStep = ProfileStep.mapFields(Struct.pick(['title', 'instruction']))
const DraftDependency = ProfileDependency.mapFields(Struct.pick(['dependency_id', 'required_version', 'required', 'install_instruction']))

/** A profile's content, with its steps and dependencies in the order its page shows them, to fill the form. */
const draftOf = (id: ProfileId) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const content = yield* oneRow(DraftContent, sql`SELECT ${sql.literal(contentColumns)} FROM profile p WHERE p.id = ${id}`)
    const steps = yield* rows(DraftStep, sql`SELECT title, instruction FROM profile_step WHERE profile_id = ${id} ORDER BY position`)
    const dependencies = yield* rows(
      DraftDependency,
      sql`SELECT pd.dependency_id, pd.required_version, pd.required, pd.install_instruction
          FROM profile_dependency pd JOIN dependency d ON d.id = pd.dependency_id
          WHERE pd.profile_id = ${id} ORDER BY pd.required DESC, d.name`,
    )
    return { ...content, steps, dependencies }
  })

const SourceEnvironment = Profile.mapFields(Struct.pick(['id', 'edition_id', 'distribution_id', 'layer_version_id', 'architecture']))

/**
 * The propose form. `from` names a profile of the same game to start from, a new version with changes:
 * a public one, or one of the visitor's own whatever its status (rejected included).
 */
export const profileOptions = (gameId: GameId, from: ProfileId | null) =>
  Effect.gen(function* () {
    const user = yield* requireUser
    const sql = yield* SqlClient.SqlClient
    const [game] = yield* rows(GameRow, sql`SELECT id, title FROM game WHERE id = ${gameId}`)
    if (game === undefined) return yield* Effect.fail(new NotFound())
    const editions = yield* rows(
      EditionRow,
      sql`SELECT e.id, l.name AS launcher FROM game_edition e JOIN launcher l ON l.id = e.launcher_id
          WHERE e.game_id = ${gameId} ORDER BY l.name`,
    )
    const layers = yield* rows(LayerVersion, sql`SELECT id, family, variant, version FROM layer_version ORDER BY family, variant, version`)
    const [source] =
      from === null
        ? []
        : yield* rows(
            SourceEnvironment,
            sql`SELECT p.id, p.edition_id, p.distribution_id, p.layer_version_id, p.architecture
                FROM profile p JOIN game_edition e ON e.id = p.edition_id
                WHERE p.id = ${from} AND e.game_id = ${gameId} AND (p.review_status IN ${sql.in(activeStatuses)} OR p.author_id = ${user.id})`,
          )
    const draft = source === undefined ? null : { ...source, ...(yield* draftOf(source.id)) }
    return { game, editions, layers, distributions: yield* distributionOptions, dependencies: yield* dependencyOptions, draft }
  })

const EditedProfile = Schema.Struct({
  ...Profile.mapFields(Struct.pick(['id', 'revision', 'architecture'])).fields,
  editable: Schema.Boolean,
  game_id: Game.fields.id,
  game: Game.fields.title,
  launcher: Launcher.fields.name,
  distribution: Name,
  layer: Name,
})

/** The edit form, for the profile's author only; `editable` is false once it was used or reviewed. */
export const profileEditOptions = (id: ProfileId) =>
  Effect.gen(function* () {
    const user = yield* requireUser
    const sql = yield* SqlClient.SqlClient
    const [profile] = yield* rows(
      EditedProfile,
      sql`SELECT p.id, p.revision, p.architecture, ${sql.literal(profileEditable('p'))} AS editable,
                 j.id AS game_id, j.title AS game, l.name AS launcher,
                 ${sql.literal(distributionLabel('di'))} AS distribution, ${sql.literal(layerLabel('c'))} AS layer
          FROM profile p JOIN game_edition e ON e.id = p.edition_id JOIN game j ON j.id = e.game_id JOIN launcher l ON l.id = e.launcher_id
            JOIN distribution di ON di.id = p.distribution_id JOIN layer_version c ON c.id = p.layer_version_id
          WHERE p.id = ${id} AND p.author_id = ${user.id}`,
    )
    if (profile === undefined) return yield* Effect.fail(new NotFound())
    return { profile, draft: yield* draftOf(id), dependencies: yield* dependencyOptions }
  })

export const guideOptions = Effect.gen(function* () {
  yield* requireReviewer
  return { distributions: yield* distributionOptions }
})

const GuideDraft = AdoptionGuide.mapFields(Struct.pick(['id', 'type', 'distribution_id', 'title', 'content', 'revision', 'status']))

export const guideEditOptions = (id: GuideId) =>
  Effect.gen(function* () {
    yield* requireReviewer
    const sql = yield* SqlClient.SqlClient
    const [guide] = yield* rows(GuideDraft, sql`SELECT id, type, distribution_id, title, content, revision, status FROM adoption_guide WHERE id = ${id}`)
    if (guide === undefined) return yield* Effect.fail(new NotFound())
    return { guide, distributions: yield* distributionOptions }
  })
