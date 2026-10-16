import { Effect, Schema, Struct } from 'effect'
import { SqlClient } from 'effect/sql'
import { TargetProfile } from '../../domain/contributions.ts'
import { NotFound } from '../../domain/errors.ts'
import { DiagnosticId, DistributionId, EditionId, type GameId, type ProfileId, type ReportId } from '../../domain/ids.ts'
import { activeStatuses } from '../../domain/review.ts'
import { Diagnostic, Machine, Game, Launcher, Profile, Report, FailureType, LayerVersion } from '../../domain/tables.ts'
import { requireReviewer, requireUser } from '../auth.ts'
import { rows } from '../rows.ts'
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

export const gameOptions = Effect.gen(function* () {
  yield* requireReviewer
  const sql = yield* SqlClient.SqlClient
  return { launchers: yield* rows(LauncherRow, sql`SELECT id, name FROM launcher ORDER BY name`) }
})
