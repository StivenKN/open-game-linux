import { Effect, Schema } from 'effect'
import type { SqlError } from 'effect/sql'

export type Infra = SqlError.SqlError | Schema.SchemaError

export const filas = <A, I>(fila: Schema.Codec<A, I>, consulta: Effect.Effect<ReadonlyArray<unknown>, SqlError.SqlError>) =>
  Effect.flatMap(consulta, Schema.decodeUnknownEffect(Schema.Array(fila)))

export const unaFila = <A, I>(fila: Schema.Codec<A, I>, consulta: Effect.Effect<ReadonlyArray<unknown>, SqlError.SqlError>) =>
  Effect.flatMap(filas(fila, consulta), ([primera]) => (primera === undefined ? Effect.die('la sentencia no devolvió ninguna fila') : Effect.succeed(primera)))
