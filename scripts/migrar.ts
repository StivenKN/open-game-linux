// `pnpm db:migrar` applies pending migrations and is idempotent: a second run logs `[]`.
// `pnpm db:reset` drops the public schema first, and only on a localhost database.
import { Effect } from 'effect'
import { NodeServices } from '@effect/platform-node'
import { PgLive } from '../src/servidor/runtime.ts'
import { migrar, vaciarEsquema } from '../src/servidor/esquema/migraciones.ts'

const reiniciar = process.argv.includes('--reset')
const esLocal = (url: string | undefined) => url !== undefined && ['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname)
if (reiniciar && !esLocal(process.env.DATABASE_URL)) throw new Error('db:reset solo borra bases locales: DATABASE_URL debe apuntar a localhost')

const programa = Effect.gen(function* () {
  if (reiniciar) yield* vaciarEsquema
  yield* Effect.log('migraciones aplicadas', yield* migrar)
}).pipe(Effect.provide([PgLive, NodeServices.layer]))

Effect.runPromise(programa).then(
  () => process.exit(0),
  (e: unknown) => {
    console.error(e)
    process.exit(1)
  },
)
