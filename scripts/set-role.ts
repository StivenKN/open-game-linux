// `pnpm set-role <email> <usuario|revisor|administrador>`: the only way to promote an account (no admin UI).
import { Effect, Schema } from 'effect'
import { Role } from '../src/domain/review.ts'
import { assignRole } from '../src/server/auth.ts'
import { PgLive } from '../src/server/runtime.ts'

const [correo = '', rol] = process.argv.slice(2)

const programa = Schema.decodeUnknownEffect(Role)(rol).pipe(
  Effect.catchTag('SchemaError', () => Effect.die(`Usage: pnpm set-role <email> <${Role.literals.join('|')}>`)),
  Effect.flatMap((r) => assignRole(correo, r)),
  Effect.catchTag('NoEncontrado', () => Effect.die(`No account has the email ${correo}`)),
  Effect.flatMap((r) => Effect.log(r.changed ? `${r.alias} is now ${r.role}` : `${r.alias} was already ${r.role}; nothing to change`)),
  Effect.provide(PgLive),
)

Effect.runPromise(programa).then(
  () => process.exit(0),
  (e: unknown) => {
    console.error(e)
    process.exit(1)
  },
)
