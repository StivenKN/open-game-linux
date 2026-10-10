import { Effect } from 'effect'
import { Migrator } from 'effect/sql'
import { PgMigrator } from '@effect/sql-pg'
import { NodeServices } from '@effect/platform-node'
import { PgLive } from '../src/server/db.ts'
import { migrations } from '../src/server/migrations.ts'

const program = PgMigrator.run({ loader: Migrator.fromRecord(migrations) }).pipe(
  Effect.tap((ran) => Effect.log('ran', ran)),
  Effect.provide([PgLive, NodeServices.layer]),
)

Effect.runPromise(program).then(
  () => process.exit(0),
  (e) => {
    console.error(e)
    process.exit(1)
  },
)
