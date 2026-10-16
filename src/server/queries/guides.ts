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
      SELECT g.id, g.tipo, g.titulo, g.actualizado_en, ${sql.literal(distributionLabel('d'))} AS distribucion,
             ${sql.literal(isDemo('u'))} AS ejemplo
      FROM guia_adopcion g
      JOIN usuario u ON u.id = g.autor_id
      LEFT JOIN distribucion d ON d.id = g.distribucion_id
      WHERE g.estado = 'publicada'
      ORDER BY g.tipo, g.titulo`,
  })(undefined),
)

export const guide = (id: GuideId) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const row = yield* SqlSchema.findOneOption({
      Request: GuideId,
      Result: GuideDetail,
      execute: (id) => sql`
        SELECT g.id, g.tipo, g.titulo, g.contenido, g.revision, g.actualizado_en, ${sql.literal(distributionLabel('d'))} AS distribucion,
               u.alias AS autor, ${sql.literal(isDemo('u'))} AS ejemplo
        FROM guia_adopcion g
        JOIN usuario u ON u.id = g.autor_id
        LEFT JOIN distribucion d ON d.id = g.distribucion_id
        WHERE g.id = ${id} AND g.estado = 'publicada'`,
    })(id)
    if (Option.isNone(row)) return yield* new NotFound()
    return row.value
  })
