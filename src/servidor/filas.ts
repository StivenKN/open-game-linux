// Row decoding for raw `sql` statements: every query result is parsed with a dominio row Schema.
import { Effect, Schema } from 'effect'
import type { SqlError } from 'effect/sql'

/** The rows a statement returned, decoded with `fila`. Destructure `[primera]` for a single-row lookup. */
export const filas = <A, I>(fila: Schema.Codec<A, I>, consulta: Effect.Effect<ReadonlyArray<unknown>, SqlError.SqlError>) =>
  Effect.flatMap(consulta, Schema.decodeUnknownEffect(Schema.Array(fila)))
