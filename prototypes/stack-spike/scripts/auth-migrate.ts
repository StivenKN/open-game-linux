import { getMigrations } from 'better-auth/db/migration'
import { auth, authPool } from '../src/server/auth.ts'

const { toBeCreated, toBeAdded, compileMigrations, runMigrations } = await getMigrations(auth.options)
console.log('toBeCreated', toBeCreated.map((t) => `${t.table}(${Object.keys(t.fields).join(',')})`))
console.log('toBeAdded', toBeAdded.map((t) => t.table))
console.log((await compileMigrations()).slice(0, 3000))
await runMigrations()
await authPool.end()
