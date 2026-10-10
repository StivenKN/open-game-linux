import { getRequest } from '@tanstack/react-start/server'
import { Context, Effect, Option, Schema } from 'effect'
import { SqlClient } from 'effect/sql'
import { auth } from './auth.ts'

type AuthSession = NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>

// Per-request service: the authenticated user, provided at the server-fn boundary.
export class Sesion extends Context.Service<Sesion, AuthSession>()('Sesion') {}

export class NoAutenticado extends Schema.TaggedError<NoAutenticado>()('NoAutenticado', {}) {}

export const sesionDeRequest = Effect.promise(() => auth.api.getSession({ headers: getRequest().headers })).pipe(
  Effect.flatMap((s) =>
    Option.match(Option.fromNullishOr(s), {
      onNone: () => Effect.fail(new NoAutenticado()),
      onSome: Effect.succeed,
    }),
  ),
)

// Effect program that needs the session and the DB.
export const quienSoy = Effect.gen(function* () {
  const { user } = yield* Sesion
  const sql = yield* SqlClient.SqlClient
  const [row] = yield* sql<{ alias: string; correo: string }>`SELECT alias, correo FROM usuario WHERE id = ${user.id}`
  return { fromSession: { id: user.id, name: user.name, email: user.email }, fromSql: row }
})
