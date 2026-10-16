// `pnpm db:migrar` applies pending migrations and is idempotent: a second run logs `[]`.
// `pnpm db:reset <base>` drops the public schema first, only when <base> names the database DATABASE_URL reaches.
import { Effect } from 'effect'
import { NodeServices } from '@effect/platform-node'
import { PgLive } from '../src/server/runtime.ts'
import { migrar, vaciarEsquema } from '../src/server/schema/migrations.ts'

const reset = process.argv.indexOf('--reset')

const programa = Effect.gen(function* () {
  if (reset !== -1) yield* vaciarEsquema(process.argv[reset + 1] ?? '')
  yield* Effect.log('migraciones aplicadas', yield* migrar)
}).pipe(Effect.provide([PgLive, NodeServices.layer]))

Effect.runPromise(programa).then(
  () => process.exit(0),
  (e: unknown) => {
    console.error(e)
    process.exit(1)
  },
)
