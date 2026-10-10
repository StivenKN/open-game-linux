// Prints better-auth's DDL for esquemaAuth, to paste into migration 1_auth (one array element per statement).
// Run: node --env-file=.env scripts/auth-sql.ts
// It compiles against an empty schema, so it resets `public` and refuses any database not named *_test.
import { getMigrations } from 'better-auth/db/migration'
import { Pool } from 'pg'
import { esquemaAuth } from '../src/servidor/esquema/auth.ts'

const url = process.env.DATABASE_URL_TEST
if (url === undefined || !new URL(url).pathname.endsWith('_test')) throw new Error('DATABASE_URL_TEST must name a *_test database')

const pool = new Pool({ connectionString: url, max: 1 })
try {
  await pool.query('DROP SCHEMA public CASCADE')
  await pool.query('CREATE SCHEMA public')
  const { compileMigrations } = await getMigrations({ ...esquemaAuth, database: pool })
  console.log(await compileMigrations())
} finally {
  await pool.end()
}
