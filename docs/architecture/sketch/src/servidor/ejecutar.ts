// The only bridge from a server fn handler to Effect. Two functions, one per kind of server fn.
//
//   leer(programa)              loaders: Promise<A>; NoEncontrado/SinPermiso -> notFound(), NoAutenticado -> redirect
//   accion(Fallos, programa)    UI-triggered calls (writes, guest evaluation): one transaction;
//                               Promise<Respuesta<A, Fallos.Encoded>>
//
// Both resolve the session once into `Visitante`. SqlError / SchemaError are infra: they are
// thrown as defects and the route's errorComponent renders a generic "algo falló".
import { notFound, redirect } from '@tanstack/react-router'
import { getRequest } from '@tanstack/react-start/server'
import { Cause, Effect, Exit, Option, Schema } from 'effect'
import { SqlClient, SqlError } from 'effect/sql'
import { NoAutenticado, NoEncontrado, SinPermiso, type FalloDominio, type Respuesta } from '../dominio/fallos.ts'
import { Visitante, visitanteDe } from './auth.ts'
import { runtime } from './runtime.ts'

type Control = NoEncontrado | NoAutenticado | SinPermiso
type Infra = SqlError.SqlError | Schema.SchemaError
type Servicios = SqlClient.SqlClient | Visitante

const conVisitante = <A, E>(programa: Effect.Effect<A, E, Servicios>): Effect.Effect<A, E, SqlClient.SqlClient> =>
  Effect.flatMap(visitanteDe(getRequest().headers), (v) => Effect.provideService(programa, Visitante, v))

/** Throws the router's own control-flow values; Start carries them over the wire and through SSR. */
const lanzarControl = (e: Control): never => {
  switch (e._tag) {
    case 'NoEncontrado':
    case 'SinPermiso': // do not reveal that a private row exists
      throw notFound()
    case 'NoAutenticado':
      throw redirect({ to: '/entrar' })
  }
}

const esControl = (e: unknown): e is Control =>
  e instanceof NoEncontrado || e instanceof NoAutenticado || e instanceof SinPermiso

/** For loaders and other reads. The type forbids domain data errors here: a read either succeeds or redirects. */
export const leer = async <A>(programa: Effect.Effect<A, Control | Infra, Servicios>): Promise<A> => {
  const exit = await runtime.runPromiseExit(conVisitante(programa))
  if (Exit.isSuccess(exit)) return exit.value
  const error = Exit.findErrorOption(exit)
  if (Option.isSome(error) && esControl(error.value)) return lanzarControl(error.value)
  throw Cause.squash(exit.cause)
}

/**
 * For server fns called from UI events (every write, plus the guest evaluation). `fallos` is the schema of the domain failures this write may return as data
 * (usually `ReglaIncumplida`, or a Schema.Union of classes from FalloDominio). The compiler rejects
 * a program whose error channel holds a domain failure `fallos` does not list, so the browser's
 * `Respuesta` type is exactly what the server can send.
 * Runs the program in ONE transaction: a failure after a partial insert rolls everything back.
 */
export const accion = async <A, S extends Schema.Codec<FalloDominio, unknown>>(
  fallos: S,
  programa: Effect.Effect<A, S['Type'] | Control | Infra, Servicios>,
): Promise<Respuesta<A, S['Encoded']>> => {
  const enTransaccion = Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    return yield* sql.withTransaction(programa)
  })
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
