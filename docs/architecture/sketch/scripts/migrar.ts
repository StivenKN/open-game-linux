// `pnpm db:migrar` — idempotent (PgMigrator tracks effect_sql_migrations; a second run logs `ran []`).
// Node 24 runs this .ts directly; relative imports carry the .ts extension (spike gotcha 12).
import { Effect } from 'effect'
import { Migrator } from 'effect/sql'
import { PgMigrator } from '@effect/sql-pg'
import { NodeServices } from '@effect/platform-node'
import { PgLive } from '../src/servidor/runtime.ts'
import { migraciones } from '../src/servidor/esquema/migraciones.ts'

const programa = PgMigrator.run({ loader: Migrator.fromRecord(migraciones) }).pipe(
  Effect.tap((ran) => Effect.log('migraciones aplicadas', ran)),
  Effect.provide([PgLive, NodeServices.layer]),
)

Effect.runPromise(programa).then(
  () => process.exit(0),
  (e: unknown) => {
    console.error(e)
    process.exit(1)
  },
)
