// Authentication (better-auth) and authorization as Effect values.
//
// better-auth owns usuario/session/account/verification on its own pg Pool: it cannot share the
// @effect/sql-pg pool (spike Q7), so the two share DATABASE_URL only. Per request,
// servidor/ejecutar.ts resolves the session once into the `Visitante` service.
import { betterAuth } from 'better-auth'
import { tanstackStartCookies } from 'better-auth/tanstack-start'
import { Brand, Context, Effect, Option, Schema } from 'effect'
import { SqlClient } from 'effect/sql'
import { Pool } from 'pg'
import { NoAutenticado, NoEncontrado, SinPermiso } from '../dominio/fallos.ts'
import { puedeRevisar, type Rol } from '../dominio/revision.ts'
import { Usuario as FilaUsuario } from '../dominio/tablas.ts'
import { esquemaAuth } from './esquema/auth.ts'

const url = process.env.DATABASE_URL
// Without this, pg silently falls back to PGHOST/localhost:5432 and auth talks to some other database.
if (url === undefined || url === '') throw new Error('DATABASE_URL no está definida')

export const auth = betterAuth({
  ...esquemaAuth,
  // This pool (max 5) plus the Effect pool (max 10) stay well under PostgreSQL's default 100.
  database: new Pool({ connectionString: url, max: 5 }),
  emailAndPassword: { enabled: true },
  // tanstackStartCookies must stay the last plugin (better-auth warns otherwise).
  plugins: [tanstackStartCookies()],
})

/** The signed-in account as programs see it. Only `alias` is ever shown to other people (8.9 privacy). */
export type Usuario = Pick<FilaUsuario, 'id' | 'alias' | 'rol'>

/** Per-request service: who is asking. None for guests and for deactivated accounts. */
export class Visitante extends Context.Service<Visitante, Option.Option<Usuario>>()('Visitante') {}

// better-auth's JS API keeps its own names (`name`), while the column is `alias`.
const UsuarioDeSesion = Schema.Struct({
  id: FilaUsuario.fields.id,
  name: FilaUsuario.fields.alias,
  rol: FilaUsuario.fields.rol,
  activo: FilaUsuario.fields.activo,
})

/** The visitor behind a request's cookies. A session read failure is a defect, not a guest. */
export const visitanteDe = (headers: Headers): Effect.Effect<Option.Option<Usuario>> =>
  Effect.promise(() => auth.api.getSession({ headers })).pipe(
    Effect.map((sesion) =>
      Option.fromNullishOr(sesion).pipe(
        Option.flatMap((s) => Schema.decodeUnknownOption(UsuarioDeSesion)(s.user)),
        // 8.3 activo: a deactivated account keeps its contributions but can no longer act.
        Option.filter((u) => u.activo),
        Option.map((u): Usuario => ({ id: u.id, alias: u.name, rol: u.rol })),
      ),
    ),
  )

export const exigirUsuario: Effect.Effect<Usuario, NoAutenticado, Visitante> = Effect.flatMap(Visitante, (visitante) =>
  Option.match(visitante, { onNone: () => Effect.fail(new NoAutenticado()), onSome: Effect.succeed }),
)

/**
 * A Usuario proven to hold `revisor` or `administrador`. Only exigirRevisor mints it, so a program
 * taking a `Revisor` (decidir) cannot run for an unchecked account (8.9 reviewer role).
 */
export type Revisor = Usuario & Brand.Brand<'Revisor'>
const Revisor = Brand.nominal<Revisor>()

export const exigirRevisor: Effect.Effect<Revisor, NoAutenticado | SinPermiso, Visitante> = Effect.flatMap(exigirUsuario, (u) =>
  puedeRevisar[u.rol] ? Effect.succeed(Revisor(u)) : Effect.fail(new SinPermiso()),
)

/**
 * Demo accounts live under this reserved `.test` domain, which no real person can register, so a
 * contribution whose author's correo ends in `@${dominioDemo}` is "Datos de ejemplo" (open decision 3).
 */
export const dominioDemo = 'demo.opengame.test'

const RolActual = Schema.Struct({ alias: FilaUsuario.fields.alias, rol: FilaUsuario.fields.rol })

/** Sets an account's role (scripts/rol.ts and the seed; there is no admin UI). `cambio` is false when it already had it. */
export const asignarRol = (correo: string, rol: Rol) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const filas = yield* sql`SELECT alias, rol FROM usuario WHERE correo = lower(btrim(${correo}))`
    const [actual] = yield* Schema.decodeUnknownEffect(Schema.Array(RolActual))(filas)
    if (actual === undefined) return yield* Effect.fail(new NoEncontrado())
    if (actual.rol !== rol) yield* sql`UPDATE usuario SET rol = ${rol} WHERE correo = lower(btrim(${correo}))`
    return { alias: actual.alias, rol, cambio: actual.rol !== rol }
  })
