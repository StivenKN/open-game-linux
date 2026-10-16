import { Effect, Option, Schema, Struct } from 'effect'
import { SqlClient, SqlSchema } from 'effect/sql'
import { NotFound } from '../../domain/errors.ts'
import { GuideId } from '../../domain/ids.ts'
import { AdoptionGuide } from '../../domain/tables.ts'
import { isDemo, distributionLabel } from './labels.ts'

const extra = { distribucion: Schema.NullOr(Schema.String), ejemplo: Schema.Boolean }

const GuideRow = AdoptionGuide.mapFields(Struct.pick(['id', 'tipo', 'titulo', 'actualizado_en'])).mapFields(Struct.assign(extra))

const GuideDetail = AdoptionGuide.mapFields(Struct.pick(['id', 'tipo', 'titulo', 'contenido', 'revision', 'actualizado_en'])).mapFields(
  Struct.assign({ ...extra, autor: Schema.String }),
)

export const guides = Effect.flatMap(SqlClient.SqlClient, (sql) =>
  SqlSchema.findAll({
    Request: Schema.Void,
    Result: GuideRow,
    execute: () => sql`
      SELECT g.id, g.type, g.title, g.updated_at, ${sql.literal(distributionLabel('d'))} AS distribution,
             ${sql.literal(isDemo('u'))} AS demo
      FROM adoption_guide g
      JOIN app_user u ON u.id = g.author_id
      LEFT JOIN distribution d ON d.id = g.distribution_id
      WHERE g.status = 'publicada'
      ORDER BY g.type, g.title`,
  })(undefined),
)

export const guide = (id: GuideId) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const row = yield* SqlSchema.findOneOption({
      Request: GuideId,
      Result: GuideDetail,
      execute: (id) => sql`
        SELECT g.id, g.type, g.title, g.content, g.revision, g.updated_at, ${sql.literal(distributionLabel('d'))} AS distribution,
               u.alias AS author, ${sql.literal(isDemo('u'))} AS demo
        FROM adoption_guide g
        JOIN app_user u ON u.id = g.author_id
        LEFT JOIN distribution d ON d.id = g.distribution_id
        WHERE g.id = ${id} AND g.status = 'publicada'`,
    })(id)
    if (Option.isNone(row)) return yield* new NotFound()
    return row.value
  })
