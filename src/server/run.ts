// SqlError and SchemaError are infra: logged here in
// full, then thrown as a bare Error (Start would send the SQL text to the browser), and the route's
// errorComponent renders them.
import { notFound, redirect } from '@tanstack/react-router'
import { getRequest } from '@tanstack/react-start/server'
import { Cause, Effect, Exit, Option, Schema } from 'effect'
import { SqlClient } from 'effect/sql'
import { type DomainError, Unauthenticated, NotFound, type Reply, Forbidden } from '../domain/errors.ts'
import { Visitor, visitorOf } from './auth.ts'
import type { Infra } from './rows.ts'
import { runtime } from './runtime.ts'

type ControlFlow = NotFound | Unauthenticated | Forbidden
type Services = SqlClient.SqlClient | Visitor

const withVisitor = <A, E>(program: Effect.Effect<A, E, Services>): Effect.Effect<A, E, SqlClient.SqlClient> =>
  Effect.flatMap(visitorOf(getRequest().headers), (v) => Effect.provideService(program, Visitor, v))

const isControlFlow = Schema.is(Schema.Union([NotFound, Unauthenticated, Forbidden]))

const throwControlFlow = (e: ControlFlow): never => {
  switch (e._tag) {
    case 'NoEncontrado':
    case 'SinPermiso':
      throw notFound()
    case 'NoAutenticado':
      throw redirect({ to: '/entrar' })
  }
}

const internalFailure = (cause: Cause.Cause<unknown>): never => {
  console.error(Cause.pretty(cause))
  throw new Error('Error interno del servidor')
}

export const runRead = async <A>(program: Effect.Effect<A, ControlFlow | Infra, Services>): Promise<A> => {
  const exit = await runtime.runPromiseExit(withVisitor(program))
  if (Exit.isSuccess(exit)) return exit.value
  const error = Exit.findErrorOption(exit)
  if (Option.isSome(error) && isControlFlow(error.value)) return throwControlFlow(error.value)
  return internalFailure(exit.cause)
}

export const runAction = async <A, S extends Schema.Codec<DomainError, unknown>>(
  errors: S,
  program: Effect.Effect<A, S['Type'] | ControlFlow | Infra, Services>,
): Promise<Reply<A, S['Encoded']>> => {
  const inTransaction = Effect.flatMap(SqlClient.SqlClient, (sql) => sql.withTransaction(program))
  const exit = await runtime.runPromiseExit(withVisitor(inTransaction))
  if (Exit.isSuccess(exit)) return { ok: true, value: exit.value }
  const error = Exit.findErrorOption(exit)
  if (Option.isSome(error)) {
    const e = error.value
    if (isControlFlow(e)) return throwControlFlow(e)
    if (Schema.is(errors)(e)) return { ok: false, error: Schema.encodeSync(errors)(e) }
  }
  return internalFailure(exit.cause)
}
