import { readFileSync } from 'node:fs'
import { expect, layer } from '@effect/vitest'
import { NodeServices } from '@effect/platform-node'
import { PgClient, PgMigrator } from '@effect/sql-pg'
import { Effect, Exit, Record, Redacted, Schema } from 'effect'
import { Migrator, SqlClient, type SqlError } from 'effect/sql'
import { RuleViolated } from '../src/domain/errors.ts'
import { ruleByConstraint, withDbRules } from '../src/server/schema/constraints.ts'
import { dropSchema, migrations } from '../src/server/schema/migrations.ts'
import { seed, type Seed } from './fixtures.ts'
import { inRollback, PgTest } from './support.ts'

layer(PgTest)('vaciarEsquema', (it) => {
  // In a rollback, so a regressed guard drops nothing for the other test files.
  it.effect('con el nombre de otra base no borra nada', () =>
    inRollback(
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient
        yield* sql`CREATE TABLE centinela (id integer)`
        expect(Exit.isFailure(yield* Effect.exit(dropSchema('opengame')))).toBe(true)
        expect(yield* sql`SELECT to_regclass('public.centinela') IS NOT NULL AS sigue`).toEqual([{ sigue: true }])
      }),
    ),
  )
})

const EnglishNames = Schema.Struct(
  Object.fromEntries(['tables', 'columns', 'aliases', 'words', 'constraints', 'indexes', 'triggers', 'functions'].map((s) => [s, Schema.Record(Schema.String, Schema.String)])),
)
const database = Schema.decodeUnknownSync(Schema.fromJsonString(EnglishNames))(readFileSync(new URL('./fixtures/english-names.json', import.meta.url), 'utf8'))
const spanishWords = Object.values(database).flatMap(Object.keys)

const carriesSpanish = (name: string) =>
  name
    .replaceAll('"', '')
    .split('.')
    .some((part) => spanishWords.some((w) => part === w || part.startsWith(`${w}_`) || part.endsWith(`_${w}`) || part.includes(`_${w}_`)))

const Census = Schema.Array(Schema.Struct({ kind: Schema.String, name: Schema.String }))

const census = Effect.flatMap(SqlClient.SqlClient, (sql) =>
  Effect.flatMap(
    sql`
      SELECT 'table' AS kind, relname AS name FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relkind = 'r'
      UNION ALL SELECT 'column', table_name || '.' || column_name FROM information_schema.columns WHERE table_schema = 'public'
      UNION ALL SELECT 'constraint', conrelid::regclass || '.' || conname FROM pg_constraint WHERE connamespace = 'public'::regnamespace
      UNION ALL SELECT 'index', indexrelid::regclass::text FROM pg_index
        WHERE indrelid IN (SELECT oid FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relkind = 'r')
      UNION ALL SELECT 'sequence', relname FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relkind = 'S'
      UNION ALL SELECT 'trigger', tgrelid::regclass || '.' || tgname FROM pg_trigger WHERE NOT tgisinternal
      UNION ALL SELECT 'function', proname || '(' || pg_get_function_identity_arguments(oid) || ')' FROM pg_proc WHERE pronamespace = 'public'::regnamespace
      ORDER BY 1, 2`,
    Schema.decodeUnknownEffect(Census),
  ),
)

const Digest = Schema.Array(Schema.Struct({ n: Schema.Int, digest: Schema.NullOr(Schema.String) }))

const digestOf = (sql: SqlClient.SqlClient, table: string) =>
  Effect.map(
    Effect.flatMap(sql`SELECT count(*)::int AS n, md5(string_agg(t::text, '|' ORDER BY t::text)) AS digest FROM ${sql(table)} t`, Schema.decodeUnknownEffect(Digest)),
    ([row]) => row,
  )

const migrate = (keys: ReadonlyArray<string>) =>
  PgMigrator.run({ loader: Migrator.fromRecord(Object.fromEntries(Object.entries(migrations).filter(([key]) => keys.includes(key)))) }).pipe(
    Effect.provide(NodeServices.layer),
  )
const allMigrations = Object.keys(migrations)
const throughSix = allMigrations.filter((key) => !key.startsWith('7_'))

// The migrator probes for its table with a query that fails on a fresh database, which aborts any
// enclosing transaction, so the upgrade runs on a database of its own instead of inside a rollback.
const testUrl = new URL(process.env.DATABASE_URL_TEST ?? 'postgres:')
const upgradeDatabase = `${testUrl.pathname.slice(1)}_upgrade`
const UpgradePg = PgClient.layer({ url: Redacted.make(new URL(upgradeDatabase, testUrl).href), maxConnections: 2 })

const upgradeSeed = readFileSync(new URL('./fixtures/upgrade-1-6.sql', import.meta.url), 'utf8')
  .split(/;\s*\n/)
  .map((s) => s.replace(/^--.*$/gm, '').trim())
  .filter((s) => s !== '')

const rejected = <A, E>(f: Seed, offense: Effect.Effect<A, E>) => withDbRules(f.sql.withTransaction(offense))

layer(PgTest)('7_english_names', (it) => {
  it.effect('no catalog name carries a Spanish word after migrations 1 to 7', () =>
    Effect.gen(function* () {
      const rows = yield* census
      expect(rows.length).toBeGreaterThan(500)
      expect(rows.filter((r) => carriesSpanish(r.name))).toEqual([])
    }))

  const upgrade = Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* migrate(throughSix)
    for (const statement of upgradeSeed) yield* sql.unsafe(statement)
    const before = yield* census
    expect(before.filter((r) => carriesSpanish(r.name)).length).toBeGreaterThan(400)
    const tables = before.filter((r) => r.kind === 'table' && r.name !== 'effect_sql_migrations').map((r) => r.name)
    const digestsBefore = yield* Effect.forEach(tables, (t) => Effect.map(digestOf(sql, t), (d) => [t, d] as const))
    expect(digestsBefore.every(([, d]) => d.n > 0)).toBe(true)

    expect(yield* migrate(allMigrations)).toEqual([[7, 'english_names']])
    expect(yield* migrate(allMigrations)).toEqual([])

    const after = yield* census
    expect(after.filter((r) => carriesSpanish(r.name))).toEqual([])
    const digestsAfter = yield* Effect.forEach(tables, (t) => Effect.map(digestOf(sql, database.tables[t] ?? t), (d) => [t, d] as const))
    expect(digestsAfter).toEqual(digestsBefore)
    expect(yield* sql`SELECT og_content('{"review_status": "aprobado", "title": "t"}'::jsonb) AS rest`).toEqual([{ rest: { title: 't' } }])
  })

  it.effect('a database that ran 1 to 6 keeps every row through 7, and 7 runs once', () =>
    Effect.gen(function* () {
      const admin = yield* SqlClient.SqlClient
      const drop = admin.unsafe(`DROP DATABASE IF EXISTS ${upgradeDatabase} WITH (FORCE)`)
      yield* drop
      yield* admin.unsafe(`CREATE DATABASE ${upgradeDatabase}`)
      yield* Effect.ensuring(Effect.provide(upgrade, UpgradePg), Effect.ignore(drop))
    }))

  it.effect('an approved report still rejects a content edit with the same rule', () =>
    inRollback(
      Effect.gen(function* () {
        const f = yield* seed
        yield* f.sql`UPDATE report SET review_status = 'aprobado', reviewer_id = ${f.reviewer}, reviewed_at = now(), review_reason = 'probado', review_evidence = 'captura' WHERE id = ${f.rep}`
        const failure = yield* Effect.flip(rejected(f, f.sql`UPDATE report SET observations = 'otra cosa' WHERE id = ${f.rep}`))
        expect(failure).toEqual(new RuleViolated({ rule: 'contenido_inmutable' }))
        expect(yield* f.sql`SELECT observations FROM report WHERE id = ${f.rep}`).toEqual([{ observations: 'pantalla negra' }])
      }),
    ))

  const offenses = {
    report_failure_pkey: (f) => {
      const failure = f.sql`INSERT INTO report_failure (report_id, failure_type_id, detail) VALUES (${f.rep}, ${f.failureType}, 'pantalla negra')`
      return Effect.andThen(failure, failure)
    },
    layer_version_exact_version: (f) => f.sql`INSERT INTO layer_version (family, variant, version) VALUES ('Wine', 'Staging', 'Latest')`,
    og_review_only: (f) => f.sql`UPDATE report SET observations = 'otra cosa' WHERE id = ${f.rep}`,
    game_edition_game_launcher_uq: (f) => f.sql`INSERT INTO game_edition (game_id, launcher_id) SELECT game_id, launcher_id FROM game_edition WHERE id = ${f.ed}`,
    game_edition_external_uq: (f) =>
      Effect.andThen(
        f.sql`UPDATE game_edition SET external_id = '271590' WHERE id = ${f.ed}`,
        f.sql`UPDATE game_edition SET external_id = '271590' WHERE id = ${f.ed2}`,
      ),
  } satisfies Record<keyof typeof ruleByConstraint, (f: Seed) => Effect.Effect<unknown, SqlError.SqlError>>

  for (const constraint of Record.keys(ruleByConstraint))
    it.effect(`${constraint} still turns into the rule ${ruleByConstraint[constraint]}`, () =>
      inRollback(
        Effect.gen(function* () {
          const f = yield* seed
          const failure = yield* Effect.flip(rejected(f, offenses[constraint](f)))
          expect(failure).toEqual(new RuleViolated({ rule: ruleByConstraint[constraint] }))
        }),
      ))
})
