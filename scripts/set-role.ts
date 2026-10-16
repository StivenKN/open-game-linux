// `pnpm set-role <email> <usuario|revisor|administrador>`: the only way to promote an account (no admin UI).
import { Effect, Schema } from 'effect'
import { Role } from '../src/domain/review.ts'
import { assignRole } from '../src/server/auth.ts'
import { PgLive } from '../src/server/runtime.ts'

const [email = '', role] = process.argv.slice(2)

const program = Schema.decodeUnknownEffect(Role)(role).pipe(
  Effect.catchTag('SchemaError', () => Effect.die(`Usage: pnpm set-role <email> <${Role.literals.join('|')}>`)),
  Effect.flatMap((r) => assignRole(email, r)),
  Effect.catchTag('NoEncontrado', () => Effect.die(`No account has the email ${email}`)),
  Effect.flatMap((r) => Effect.log(r.changed ? `${r.alias} is now ${r.role}` : `${r.alias} was already ${r.role}; nothing to change`)),
  Effect.provide(PgLive),
)

Effect.runPromise(program).then(
  () => process.exit(0),
  (e: unknown) => {
    console.error(e)
    process.exit(1)
  },
)
