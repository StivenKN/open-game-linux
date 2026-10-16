// Probe (c): which JS value does @effect/sql-pg hand back for each column type the schema uses?
// Run: node --env-file=.env scripts/probes/probe-types.ts
import { PgClient } from '@effect/sql-pg'
import { Effect, Redacted } from 'effect'
import { SqlClient } from 'effect/sql'

const url = process.env.DATABASE_URL_TEST
if (url === undefined) throw new Error('DATABASE_URL_TEST is not set')

const describir = (v: unknown): string =>
  v === null
    ? 'null'
    : Array.isArray(v)
      ? `Array [${v.map(describir).join(', ')}]`
      : v instanceof Date
        ? `Date ${v.toISOString()}`
        : `${typeof v} ${JSON.stringify(v, (_, x: unknown) => (typeof x === 'bigint' ? `${x}n` : x))}`

const programa = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  const [fila] = yield* sql`
    SELECT 42::integer                                AS integer,
           1234.5::numeric(7,2)                       AS numeric_7_2,
           NULL::numeric(7,2)                         AS numeric_null,
           '2026-10-01 18:30:00-05'::timestamptz      AS timestamptz,
           ARRAY['pantalla_negra','sin_audio']::text[] AS text_array,
           '{}'::text[]                               AS text_array_empty,
           true::boolean                              AS boolean,
           '2026-10-01'::date                         AS date,
           (SELECT count(*) FROM pg_database)         AS count_star,
           9007199254740993::bigint                   AS bigint,
           current_setting('TimeZone')                AS session_zone`
  for (const [columna, valor] of Object.entries(fila ?? {})) console.log(`${columna.padEnd(18)} ${describir(valor)}`)
  console.log(`process TZ         ${Intl.DateTimeFormat().resolvedOptions().timeZone}`)
})

await Effect.runPromise(programa.pipe(Effect.provide(PgClient.layer({ url: Redacted.make(url) })), Effect.scoped))
