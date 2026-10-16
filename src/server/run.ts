// SqlError and SchemaError are infra: logged here in
// full, then thrown as a bare Error (Start would send the SQL text to the browser), and the route's
// errorComponent renders them.
import { notFound, redirect } from '@tanstack/react-router'
import { getRequest } from '@tanstack/react-start/server'
import { Cause, Effect, Exit, Option, Schema } from 'effect'
import { SqlClient } from 'effect/sql'
import { type DomainError, Unauthenticated, NotFound, type Reply, Forbidden } from '../domain/errors.ts'
import { Visitante, visitanteDe } from './auth.ts'
import type { Infra } from './rows.ts'
import { runtime } from './runtime.ts'

type Control = NotFound | Unauthenticated | Forbidden
type Servicios = SqlClient.SqlClient | Visitante

const conVisitante = <A, E>(programa: Effect.Effect<A, E, Servicios>): Effect.Effect<A, E, SqlClient.SqlClient> =>
  Effect.flatMap(visitanteDe(getRequest().headers), (v) => Effect.provideService(programa, Visitante, v))

const esControl = Schema.is(Schema.Union([NotFound, Unauthenticated, Forbidden]))

const lanzarControl = (e: Control): never => {
  switch (e._tag) {
    case 'NoEncontrado':
    case 'SinPermiso':
      throw notFound()
    case 'NoAutenticado':
      throw redirect({ to: '/entrar' })
  }
}

const fallaInterna = (causa: Cause.Cause<unknown>): never => {
  console.error(Cause.pretty(causa))
  throw new Error('Error interno del servidor')
}

export const leer = async <A>(programa: Effect.Effect<A, Control | Infra, Servicios>): Promise<A> => {
  const exit = await runtime.runPromiseExit(conVisitante(programa))
  if (Exit.isSuccess(exit)) return exit.value
  const error = Exit.findErrorOption(exit)
  if (Option.isSome(error) && esControl(error.value)) return lanzarControl(error.value)
  return fallaInterna(exit.cause)
}

export const accion = async <A, S extends Schema.Codec<DomainError, unknown>>(
  fallos: S,
  programa: Effect.Effect<A, S['Type'] | Control | Infra, Servicios>,
): Promise<Reply<A, S['Encoded']>> => {
  const enTransaccion = Effect.flatMap(SqlClient.SqlClient, (sql) => sql.withTransaction(programa))
  const exit = await runtime.runPromiseExit(conVisitante(enTransaccion))
  if (Exit.isSuccess(exit)) return { ok: true, value: exit.value }
  const error = Exit.findErrorOption(exit)
  if (Option.isSome(error)) {
    const e = error.value
    if (esControl(e)) return lanzarControl(e)
    if (Schema.is(fallos)(e)) return { ok: false, error: Schema.encodeSync(fallos)(e) }
  }
  return fallaInterna(exit.cause)
}
