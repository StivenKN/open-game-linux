// better-auth owns usuario/session/account/verification on its own pg Pool: it cannot share the
// @effect/sql-pg pool (spike Q7), so the two share DATABASE_URL only.
import { betterAuth } from 'better-auth'
import { APIError, createAuthMiddleware } from 'better-auth/api'
import { tanstackStartCookies } from 'better-auth/tanstack-start'
import { Context, Effect, Option, Schema } from 'effect'
import { SqlClient } from 'effect/sql'
import { Pool } from 'pg'
import { NoAutenticado, NoEncontrado, SinPermiso } from '../dominio/fallos.ts'
import { puedeRevisar, type Rol } from '../dominio/revision.ts'
import { Usuario as FilaUsuario } from '../dominio/tablas.ts'
import { esquemaAuth } from './esquema/auth.ts'
import { filas } from './filas.ts'

const url = process.env.DATABASE_URL
// Without this, pg silently falls back to PGHOST/localhost:5432 and auth talks to some other database.
if (url === undefined || url === '') throw new Error('DATABASE_URL no está definida')

// Queries label content "Datos de ejemplo" when its author's correo is in this domain (consultas/etiquetas.ts).
export const dominioDemo = 'demo.opengame.test'

export const auth = betterAuth({
  ...esquemaAuth,
  database: new Pool({ connectionString: url, max: 5 }),
  emailAndPassword: { enabled: true },
  hooks: {
    // Only a call through /api/auth carries `request`. An in-process auth.api call, like the seed's,
    // does not, so only server code can create a demo account.
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== '/sign-up/email' || ctx.request === undefined) return
      const correo: unknown = ctx.body?.email
      if (typeof correo === 'string' && correo.trim().toLowerCase().endsWith(`@${dominioDemo}`))
        throw new APIError('BAD_REQUEST', { code: 'DOMINIO_RESERVADO', message: `El dominio ${dominioDemo} está reservado para los datos de ejemplo` })
    }),
  },
  // tanstackStartCookies must stay the last plugin (better-auth warns otherwise).
  plugins: [tanstackStartCookies()],
})

export type Usuario = Pick<FilaUsuario, 'id' | 'alias' | 'rol'>

export class Visitante extends Context.Service<Visitante, Option.Option<Usuario>>()('Visitante') {}

// better-auth's JS API keeps its own names (`name`), while the column is `alias`.
const UsuarioDeSesion = Schema.Struct({
  id: FilaUsuario.fields.id,
  name: FilaUsuario.fields.alias,
  rol: FilaUsuario.fields.rol,
  activo: FilaUsuario.fields.activo,
})

export const visitanteDe = (headers: Headers): Effect.Effect<Option.Option<Usuario>> =>
  Effect.gen(function* () {
    const sesion = yield* Effect.promise(() => auth.api.getSession({ headers }))
    if (sesion === null) return Option.none()
    const u = yield* Effect.orDie(Schema.decodeUnknownEffect(UsuarioDeSesion)(sesion.user))
    return u.activo ? Option.some({ id: u.id, alias: u.name, rol: u.rol }) : Option.none()
  })

export const exigirUsuario: Effect.Effect<Usuario, NoAutenticado, Visitante> = Effect.flatMap(Visitante, (visitante) =>
  Option.match(visitante, { onNone: () => Effect.fail(new NoAutenticado()), onSome: Effect.succeed }),
)

const revisor: unique symbol = Symbol('Revisor')

export type Revisor = Usuario & { readonly [revisor]: true }

export const exigirRevisor: Effect.Effect<Revisor, NoAutenticado | SinPermiso, Visitante> = Effect.flatMap(exigirUsuario, (u) =>
  puedeRevisar[u.rol] ? Effect.succeed({ ...u, [revisor]: true as const }) : Effect.fail(new SinPermiso()),
)

const RolCambiado = Schema.Struct({ alias: FilaUsuario.fields.alias, antes: FilaUsuario.fields.rol })

export const asignarRol = (correo: string, rol: Rol) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const [fila] = yield* filas(
      RolCambiado,
      sql`
      WITH previo AS (SELECT id, alias, rol AS antes FROM usuario WHERE correo = lower(btrim(${correo})) FOR UPDATE),
           cambio AS (UPDATE usuario u SET rol = ${rol} FROM previo WHERE u.id = previo.id AND previo.antes <> ${rol} RETURNING u.id)
      SELECT alias, antes FROM previo`,
    )
    if (fila === undefined) return yield* Effect.fail(new NoEncontrado())
    return { alias: fila.alias, rol, cambio: fila.antes !== rol }
  })
