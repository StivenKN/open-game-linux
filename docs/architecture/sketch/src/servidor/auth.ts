// Authentication (better-auth, spike Q7) and authorization as Effect values.
//
// better-auth owns usuario/session/account/verification on its own pg Pool (it cannot share the
// @effect/sql-pg pool; they share DATABASE_URL). Effect never touches better-auth internals: per
// request, servidor/ejecutar.ts resolves the session once into the `Visitante` service.
import { betterAuth } from 'better-auth'
import { tanstackStartCookies } from 'better-auth/tanstack-start'
import { Brand, Context, Effect, Option, Schema } from 'effect'
import { Pool } from 'pg'
import { NoAutenticado, SinPermiso } from '../dominio/fallos.ts'
import { UsuarioId } from '../dominio/ids.ts'
import { puedeRevisar, Rol } from '../dominio/revision.ts'

const url = process.env.DATABASE_URL
if (url === undefined) throw new Error('DATABASE_URL no está definida')

/** Budget: this pool (max 5) + the Effect pool (max 10) stay under PG's default 100. */
export const authPool = new Pool({ connectionString: url, max: 5 })

export const auth = betterAuth({
  database: authPool,
  emailAndPassword: { enabled: true, minPasswordLength: 8 },
  session: { cookieCache: { enabled: true, maxAge: 5 * 60 } }, // avoids one DB read per server fn call
  user: {
    modelName: 'usuario',
    fields: { name: 'alias', email: 'correo', emailVerified: 'correo_verificado', image: 'imagen', createdAt: 'creado_en', updatedAt: 'actualizado_en' },
    additionalFields: {
      // input: false -> sign-up cannot set them. Promotion only via scripts/rol.ts.
      rol: { type: 'string', required: true, defaultValue: 'usuario', input: false },
      activo: { type: 'boolean', required: true, defaultValue: true, input: false },
    },
  },
  plugins: [tanstackStartCookies()],
})

/** The authenticated account as programs see it. Only alias is ever shown publicly (8.9 privacy). */
export const Usuario = Schema.Struct({ id: UsuarioId, alias: Schema.String, rol: Rol })
export type Usuario = typeof Usuario.Type

/** Per-request service: who is asking. None for guests and for deactivated accounts. */
export class Visitante extends Context.Service<Visitante, Option.Option<Usuario>>()('Visitante') {}

/** Decodes better-auth's session user. better-auth's JS API keeps `name`; the DB column is alias. */
const UsuarioDeSesion = Schema.Struct({ id: UsuarioId, name: Schema.String, rol: Rol, activo: Schema.Boolean })

export const visitanteDe = (headers: Headers): Effect.Effect<Option.Option<Usuario>> =>
  Effect.promise(() => auth.api.getSession({ headers })).pipe(
    Effect.map((s) =>
      Option.fromNullishOr(s).pipe(
        Option.flatMap((sesion) => Schema.decodeUnknownOption(UsuarioDeSesion)(sesion.user)),
        Option.filter((u) => u.activo), // 8.3 activo: a deactivated account keeps its contributions but cannot act
        Option.map((u) => ({ id: u.id, alias: u.name, rol: u.rol })),
      ),
    ),
  )

export const exigirUsuario: Effect.Effect<Usuario, NoAutenticado, Visitante> = Effect.gen(function* () {
  const visitante = yield* Visitante
  return yield* Option.match(visitante, { onNone: () => Effect.fail(new NoAutenticado()), onSome: Effect.succeed })
})

/**
 * A Usuario proven to hold revisor|administrador. Only exigirRevisor mints it, so
 * `decidir(revisor: Revisor, ...)` cannot be called with an unchecked account (8.9 reviewer role).
 */
export type Revisor = Usuario & Brand.Brand<'Revisor'>
const Revisor = Brand.nominal<Revisor>()

export const exigirRevisor: Effect.Effect<Revisor, NoAutenticado | SinPermiso, Visitante> = Effect.flatMap(exigirUsuario, (u) =>
  puedeRevisar[u.rol] ? Effect.succeed(Revisor(u)) : Effect.fail(new SinPermiso()),
)
