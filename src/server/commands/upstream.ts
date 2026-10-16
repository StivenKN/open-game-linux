import { Effect, Schema } from 'effect'
import { SqlClient } from 'effect/sql'
import { RuleViolated, type Forbidden } from '../../domain/errors.ts'
import { LayerFamily } from '../../domain/literals.ts'
import { ReviewStatus } from '../../domain/review.ts'
import { GameEdition, Launcher } from '../../domain/tables.ts'
import { exportableAppId, type FixNote } from '../../domain/upstream.ts'
import { requireReviewer } from '../auth.ts'
import { isDemo } from '../queries/labels.ts'
import { rows } from '../rows.ts'
import type { Write } from './contributions.ts'

const ExportableProfile = Schema.Struct({
  review_status: ReviewStatus,
  launcher: Launcher.fields.name,
  external_id: GameEdition.fields.external_id,
  family: LayerFamily,
  demo: Schema.Boolean,
})
const IdRow = Schema.Struct({ id: Schema.Int })
const PrOwner = Schema.Struct({ profile_id: Schema.Int })

/**
 * The single writer of arreglo_upstream. Idempotent: recording a PR twice, or annulling a PR that is not
 * recorded, changes nothing. A later retirement of the profile leaves its rows: the merge upstream happened.
 */
export const noteFix = (note: FixNote): Write<{ readonly changed: boolean }, RuleViolated | Forbidden> =>
  Effect.gen(function* () {
    const reviewer = yield* requireReviewer
    const sql = yield* SqlClient.SqlClient
    if (note._tag === 'Anular') {
      const deleted = yield* rows(IdRow, sql`DELETE FROM upstream_fix WHERE pr = ${note.pr} RETURNING id`)
      return { changed: deleted.length > 0 }
    }

    const [profile] = yield* rows(
      ExportableProfile,
      sql`SELECT p.review_status, l.name AS launcher, e.external_id, vc.family, ${sql.literal(isDemo('u'))} AS demo
          FROM profile p
          JOIN game_edition e ON e.id = p.edition_id
          JOIN launcher l ON l.id = e.launcher_id
          JOIN layer_version vc ON vc.id = p.layer_version_id
          JOIN app_user u ON u.id = p.author_id
          WHERE p.id = ${note.profile_id}
          FOR SHARE OF p`,
    )
    if (profile === undefined || profile.review_status !== 'aprobado' || exportableAppId(profile)._tag === 'no_exportable')
      return yield* Effect.fail(new RuleViolated({ rule: 'arreglo_no_exportable' }))
    if (profile.demo) return yield* Effect.fail(new RuleViolated({ rule: 'arreglo_datos_de_ejemplo' }))

    const created = yield* rows(
      IdRow,
      sql`INSERT INTO upstream_fix ${sql.insert({ pr: note.pr, profile_id: note.profile_id, noted_by: reviewer.id })}
          ON CONFLICT ON CONSTRAINT upstream_fix_pr_uq DO NOTHING RETURNING id`,
    )
    if (created.length > 0) return { changed: true }
    const [existing] = yield* rows(PrOwner, sql`SELECT profile_id FROM upstream_fix WHERE pr = ${note.pr}`)
    if (existing?.profile_id !== note.profile_id) return yield* Effect.fail(new RuleViolated({ rule: 'arreglo_pr_de_otro_perfil' }))
    return { changed: false }
  })
