// `pnpm set-role <correo> <usuario|revisor|administrador>`: the only way to promote an account (no admin UI).
import { Effect, Schema } from 'effect'
import { Role } from '../src/domain/review.ts'
import { assignRole } from '../src/server/auth.ts'
import { PgLive } from '../src/server/runtime.ts'

const [correo = '', rol] = process.argv.slice(2)

const programa = Schema.decodeUnknownEffect(Role)(rol).pipe(
  Effect.catchTag('SchemaError', () => Effect.die(`Uso: pnpm set-role <correo> <${Role.literals.join('|')}>`)),
  Effect.flatMap((r) => assignRole(correo, r)),
  Effect.catchTag('NoEncontrado', () => Effect.die(`No hay ninguna cuenta con el correo ${correo}`)),
  Effect.flatMap((r) => Effect.log(r.changed ? `${r.alias} ahora es ${r.role}` : `${r.alias} ya era ${r.role}; nada que cambiar`)),
  Effect.provide(PgLive),
)

Effect.runPromise(programa).then(
  () => process.exit(0),
  (e: unknown) => {
    console.error(e)
    process.exit(1)
  },
)
