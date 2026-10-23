import { Effect, Schema, SchemaTransformation } from 'effect'

/** A search param that drops a malformed value instead of failing the page. */
export const lenient = <S extends Schema.Constraint>(field: S) => Schema.catchDecoding<S>(() => Effect.succeedNone)(field)

// The router JSON-parses each query value, so a title typed as `?q=2` arrives as the number 2.
export const SearchText = Schema.Union([Schema.String, Schema.Finite, Schema.Boolean]).pipe(
  Schema.decodeTo(Schema.String, SchemaTransformation.transform<string, string | number | boolean>({ decode: String, encode: (s) => s })),
)
