// `pnpm rol <correo> <usuario|revisor|administrador>`: the only way to promote an account (no admin UI).
// The new role applies on the account's next request; sessions read it from the database each time.
import { Effect, Schema } from 'effect'
import { Rol } from '../src/dominio/revision.ts'
import { asignarRol } from '../src/servidor/auth.ts'
import { PgLive } from '../src/servidor/runtime.ts'

const [correo = '', rol] = process.argv.slice(2)

const programa = Schema.decodeUnknownEffect(Rol)(rol).pipe(
  Effect.catchTag('SchemaError', () => Effect.die(`Uso: pnpm rol <correo> <${Rol.literals.join('|')}>`)),
  Effect.flatMap((r) => asignarRol(correo, r)),
  Effect.catchTag('NoEncontrado', () => Effect.die(`No hay ninguna cuenta con el correo ${correo}`)),
  Effect.flatMap((r) => Effect.log(r.cambio ? `${r.alias} ahora es ${r.rol}` : `${r.alias} ya era ${r.rol}; nada que cambiar`)),
  Effect.provide(PgLive),
)

Effect.runPromise(programa).then(
  () => process.exit(0),
  (e: unknown) => {
    console.error(e)
    process.exit(1)
  },
)
