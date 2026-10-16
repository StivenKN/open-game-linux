import { Effect, Schema } from 'effect'
import type { SqlError } from 'effect/sql'

export type Infra = SqlError.SqlError | Schema.SchemaError

export const rows = <A, I>(row: Schema.Codec<A, I>, query: Effect.Effect<ReadonlyArray<unknown>, SqlError.SqlError>) =>
  Effect.flatMap(query, Schema.decodeUnknownEffect(Schema.Array(row)))

export const oneRow = <A, I>(row: Schema.Codec<A, I>, query: Effect.Effect<ReadonlyArray<unknown>, SqlError.SqlError>) =>
  Effect.flatMap(rows(row, query), ([first]) => (first === undefined ? Effect.die('la sentencia no devolvió ninguna fila') : Effect.succeed(first)))
