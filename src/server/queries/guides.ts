import { Effect, Option, Schema, Struct } from 'effect'
import { SqlClient, SqlSchema } from 'effect/sql'
import { NotFound } from '../../domain/errors.ts'
import { GuideStatus } from '../../domain/guides.ts'
import { GuideId } from '../../domain/ids.ts'
import { canReview } from '../../domain/review.ts'
import { AdoptionGuide } from '../../domain/tables.ts'
import { Visitor } from '../auth.ts'
import { isDemo, distributionLabel } from './labels.ts'

const extra = { distribution: Schema.NullOr(Schema.String), demo: Schema.Boolean }

const GuideRow = AdoptionGuide.mapFields(Struct.pick(['id', 'type', 'title', 'status', 'updated_at'])).mapFields(Struct.assign(extra))

const GuideDetail = AdoptionGuide.mapFields(Struct.pick(['id', 'type', 'title', 'content', 'revision', 'status', 'updated_at'])).mapFields(
  Struct.assign({ ...extra, author: Schema.String }),
)

const published: ReadonlyArray<GuideStatus> = ['publicada']

/** Readers see published guides. Reviewers, who write them, also see drafts and archived ones. */
const visibleStatuses = Effect.map(Visitor, (v) => (Option.exists(v, (u) => canReview[u.role]) ? GuideStatus.literals : published))

export const guides = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  const statuses = yield* visibleStatuses
  return yield* SqlSchema.findAll({
    Request: Schema.Void,
    Result: GuideRow,
    execute: () => sql`
      SELECT g.id, g.type, g.title, g.status, g.updated_at, ${sql.literal(distributionLabel('d'))} AS distribution,
             ${sql.literal(isDemo('u'))} AS demo
      FROM adoption_guide g
      JOIN app_user u ON u.id = g.author_id
      LEFT JOIN distribution d ON d.id = g.distribution_id
      WHERE g.status IN ${sql.in(statuses)}
      ORDER BY g.type, g.title`,
  })(undefined)
})

export const guide = (id: GuideId) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const statuses = yield* visibleStatuses
    const row = yield* SqlSchema.findOneOption({
      Request: GuideId,
      Result: GuideDetail,
      execute: (id) => sql`
        SELECT g.id, g.type, g.title, g.content, g.revision, g.status, g.updated_at, ${sql.literal(distributionLabel('d'))} AS distribution,
               u.alias AS author, ${sql.literal(isDemo('u'))} AS demo
        FROM adoption_guide g
        JOIN app_user u ON u.id = g.author_id
        LEFT JOIN distribution d ON d.id = g.distribution_id
        WHERE g.id = ${id} AND g.status IN ${sql.in(statuses)}`,
    })(id)
    if (Option.isNone(row)) return yield* new NotFound()
    return row.value
  })
