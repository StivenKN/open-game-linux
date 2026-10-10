// The only bridge from a server fn handler to Effect. One runner per kind of server fn:
//
//   leer(programa)             loaders: Promise<A>. NoEncontrado/SinPermiso -> notFound(), NoAutenticado -> redirect.
//   accion(fallos, programa)   UI events (writes, guest evaluation): one transaction, Promise<Respuesta<A, fallos.Encoded>>.
//
// Both resolve the session once into `Visitante`. SqlError and SchemaError are infra: they are thrown,
// and the route's errorComponent renders them.
import { notFound, redirect } from '@tanstack/react-router'
import { getRequest } from '@tanstack/react-start/server'
import { Cause, Effect, Exit, Option, Schema } from 'effect'
import { SqlClient, type SqlError } from 'effect/sql'
import { type FalloDominio, NoAutenticado, NoEncontrado, type Respuesta, SinPermiso } from '../dominio/fallos.ts'
import { Visitante, visitanteDe } from './auth.ts'
import { runtime } from './runtime.ts'

type Control = NoEncontrado | NoAutenticado | SinPermiso
type Infra = SqlError.SqlError | Schema.SchemaError
type Servicios = SqlClient.SqlClient | Visitante

const conVisitante = <A, E>(programa: Effect.Effect<A, E, Servicios>): Effect.Effect<A, E, SqlClient.SqlClient> =>
  Effect.flatMap(visitanteDe(getRequest().headers), (v) => Effect.provideService(programa, Visitante, v))

const esControl = Schema.is(Schema.Union([NoEncontrado, NoAutenticado, SinPermiso]))

/** The router's own throwables, which Start carries over SSR and RPC alike. */
const lanzarControl = (e: Control): never => {
  switch (e._tag) {
    case 'NoEncontrado':
    case 'SinPermiso': // answering notFound does not reveal that a private row exists
      throw notFound()
    case 'NoAutenticado':
      throw redirect({ to: '/entrar' })
  }
}

/** For loaders and other reads. The type admits no domain failure: a read succeeds, redirects or breaks. */
export const leer = async <A>(programa: Effect.Effect<A, Control | Infra, Servicios>): Promise<A> => {
  const exit = await runtime.runPromiseExit(conVisitante(programa))
  if (Exit.isSuccess(exit)) return exit.value
  const error = Exit.findErrorOption(exit)
  if (Option.isSome(error) && esControl(error.value)) return lanzarControl(error.value)
  throw Cause.squash(exit.cause)
}

/**
 * For server fns a UI event calls. `fallos` lists the domain failures this program may return as data:
 * one class (`ReglaIncumplida`) or a `Schema.Union` of FalloDominio members. A program whose error
 * channel holds a failure `fallos` does not list fails to compile, so the browser's `Respuesta` type is
 * exactly what the server can send.
 *
 * The program runs in ONE transaction, so a failure after a partial insert rolls everything back.
 */
export const accion = async <A, S extends Schema.Codec<FalloDominio, unknown>>(
  fallos: S,
  programa: Effect.Effect<A, S['Type'] | Control | Infra, Servicios>,
): Promise<Respuesta<A, S['Encoded']>> => {
  const enTransaccion = Effect.flatMap(SqlClient.SqlClient, (sql) => sql.withTransaction(programa))
  const exit = await runtime.runPromiseExit(conVisitante(enTransaccion))
  if (Exit.isSuccess(exit)) return { ok: true, valor: exit.value }
  const error = Exit.findErrorOption(exit)
  if (Option.isSome(error)) {
    const e = error.value
    if (esControl(e)) return lanzarControl(e)
    if (Schema.is(fallos)(e)) return { ok: false, fallo: Schema.encodeSync(fallos)(e) }
  }
  throw Cause.squash(exit.cause)
}
