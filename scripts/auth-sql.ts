// Prints better-auth's DDL for esquemaAuth, to paste into migration 1_auth (one array element per statement).
// Run: node --env-file=.env scripts/auth-sql.ts
// It compiles against an empty schema, so it resets `public` and refuses any database not named *_test.
import { getMigrations } from 'better-auth/db/migration'
import { Schema } from 'effect'
import { Pool } from 'pg'
import { authSchema } from '../src/server/schema/auth.ts'

const pool = new Pool({ connectionString: process.env.DATABASE_URL_TEST, max: 1 })
try {
  const { rows } = await pool.query('SELECT current_database() AS nombre')
  const [{ nombre }] = Schema.decodeUnknownSync(Schema.Tuple([Schema.Struct({ nombre: Schema.String })]))(rows)
  if (!nombre.endsWith('_test')) throw new Error(`DATABASE_URL_TEST apunta a ${nombre}; este script solo borra bases *_test`)
  await pool.query('DROP SCHEMA public CASCADE')
  await pool.query('CREATE SCHEMA public')
  const { compileMigrations } = await getMigrations({ ...authSchema, database: pool })
  console.log(await compileMigrations())
} finally {
  await pool.end()
}
