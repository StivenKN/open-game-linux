// better-auth owns usuario/session/account/verification on its own pg Pool: it cannot share the
// @effect/sql-pg pool (spike Q7), so the two share DATABASE_URL only.
import { betterAuth } from 'better-auth'
import { APIError, createAuthMiddleware } from 'better-auth/api'
import { tanstackStartCookies } from 'better-auth/tanstack-start'
import { Context, Effect, Option, Schema } from 'effect'
import { Pool } from 'pg'
import { Unauthenticated, Forbidden } from '../domain/errors.ts'
import { canReview } from '../domain/review.ts'
import { User } from '../domain/tables.ts'
import { authSchema } from './schema/auth.ts'

const url = process.env.DATABASE_URL
// Without this, pg silently falls back to PGHOST/localhost:5432 and auth talks to some other database.
if (url === undefined || url === '') throw new Error('DATABASE_URL is not set')

// Queries label content "Datos de ejemplo" when its author's email is in this domain (queries/labels.ts).
export const demoDomain = 'demo.opengame.test'

export const auth = betterAuth({
  ...authSchema,
  database: new Pool({ connectionString: url, max: 5 }),
  emailAndPassword: { enabled: true },
  hooks: {
    // Only a call through /api/auth carries `request`. An in-process auth.api call, like the seed's,
    // does not, so only server code can create a demo account.
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== '/sign-up/email' || ctx.request === undefined) return
      const email: unknown = ctx.body?.email
      if (typeof email === 'string' && email.trim().toLowerCase().endsWith(`@${demoDomain}`))
        throw new APIError('BAD_REQUEST', { code: 'DOMINIO_RESERVADO', message: `El dominio ${demoDomain} está reservado para los datos de ejemplo` })
    }),
  },
  // tanstackStartCookies must stay the last plugin (better-auth warns otherwise).
  plugins: [tanstackStartCookies()],
})

export type SignedInUser = Pick<User, 'id' | 'alias' | 'role'>

export class Visitor extends Context.Service<Visitor, Option.Option<SignedInUser>>()('Visitante') {}

// better-auth's JS API keeps its own names (`name`), while the column is `alias`.
const SessionUser = Schema.Struct({
  id: User.fields.id,
  name: User.fields.alias,
  rol: User.fields.role,
  activo: User.fields.active,
})

export const visitorOf = (headers: Headers): Effect.Effect<Option.Option<SignedInUser>> =>
  Effect.gen(function* () {
    const session = yield* Effect.promise(() => auth.api.getSession({ headers }))
    if (session === null) return Option.none()
    const u = yield* Effect.orDie(Schema.decodeUnknownEffect(SessionUser)(session.user))
    return u.activo ? Option.some({ id: u.id, alias: u.name, role: u.rol }) : Option.none()
  })

export const requireUser: Effect.Effect<SignedInUser, Unauthenticated, Visitor> = Effect.flatMap(Visitor, (visitor) =>
  Option.match(visitor, { onNone: () => Effect.fail(new Unauthenticated()), onSome: Effect.succeed }),
)

const reviewer: unique symbol = Symbol('Revisor')

export type Reviewer = SignedInUser & { readonly [reviewer]: true }

export const requireReviewer: Effect.Effect<Reviewer, Unauthenticated | Forbidden, Visitor> = Effect.flatMap(requireUser, (u) =>
  canReview[u.role] ? Effect.succeed({ ...u, [reviewer]: true as const }) : Effect.fail(new Forbidden()),
)

const admin: unique symbol = Symbol('Administrador')

export type Admin = SignedInUser & { readonly [admin]: true }

export const requireAdmin: Effect.Effect<Admin, Unauthenticated | Forbidden, Visitor> = Effect.flatMap(requireUser, (u) =>
  u.role === 'administrador' ? Effect.succeed({ ...u, [admin]: true as const }) : Effect.fail(new Forbidden()),
)
