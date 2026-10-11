// Row decoding for raw `sql` statements: every query result is parsed with a dominio row Schema.
import { Effect, Schema } from 'effect'
import type { SqlError } from 'effect/sql'

/** What a statement and its row decoding fail with: infrastructure, never a domain failure. */
export type Infra = SqlError.SqlError | Schema.SchemaError

/** The rows a statement returned, decoded with `fila`. Destructure `[primera]` for a single-row lookup. */
export const filas = <A, I>(fila: Schema.Codec<A, I>, consulta: Effect.Effect<ReadonlyArray<unknown>, SqlError.SqlError>) =>
  Effect.flatMap(consulta, Schema.decodeUnknownEffect(Schema.Array(fila)))

/** The row a statement always returns (INSERT ... RETURNING, an aggregate). An empty result is a defect. */
export const unaFila = <A, I>(fila: Schema.Codec<A, I>, consulta: Effect.Effect<ReadonlyArray<unknown>, SqlError.SqlError>) =>
  Effect.flatMap(filas(fila, consulta), ([primera]) => (primera === undefined ? Effect.die('la sentencia no devolvió ninguna fila') : Effect.succeed(primera)))
