import { betterAuth } from 'better-auth'
import { tanstackStartCookies } from 'better-auth/tanstack-start'
import { Pool } from 'pg'
import { DATABASE_URL } from './db.ts'

// better-auth drives its own node-postgres Pool (via its Kysely adapter); @effect/sql-pg has its own native driver.
// They share the connection string, not the pool.
export const authPool = new Pool({ connectionString: DATABASE_URL })

export const auth = betterAuth({
  baseURL: 'http://localhost:3000',
  secret: 'spike-secret-spike-secret-spike-secret-0123',
  database: authPool,
  emailAndPassword: { enabled: true },
  user: {
    modelName: 'usuario',
    fields: { name: 'alias', email: 'correo' },
  },
  plugins: [tanstackStartCookies()],
})
