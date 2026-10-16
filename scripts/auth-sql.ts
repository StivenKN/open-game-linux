// Prints the DDL better-auth would create for authSchema, to compare against the migrated schema. Never paste it into a migration.
// It resets `public` of DATABASE_URL_TEST, so it refuses any database not named *_test.
import { getMigrations } from 'better-auth/db/migration'
import { Schema } from 'effect'
import { Pool } from 'pg'
import { authSchema } from '../src/server/schema/auth.ts'

const pool = new Pool({ connectionString: process.env.DATABASE_URL_TEST, max: 1 })
try {
  const { rows } = await pool.query('SELECT current_database() AS name')
  const [{ name }] = Schema.decodeUnknownSync(Schema.Tuple([Schema.Struct({ name: Schema.String })]))(rows)
  if (!name.endsWith('_test')) throw new Error(`DATABASE_URL_TEST points at ${name}; this script only wipes *_test databases`)
  await pool.query('DROP SCHEMA public CASCADE')
  await pool.query('CREATE SCHEMA public')
  const { compileMigrations } = await getMigrations({ ...authSchema, database: pool })
  console.log(await compileMigrations())
} finally {
  await pool.end()
}
