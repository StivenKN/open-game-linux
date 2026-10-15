import { Config, Effect, Option, Schema } from 'effect'
import { PgClient } from '@effect/sql-pg'
import { SqlClient, SqlError } from 'effect/sql'
import { TestClock } from 'effect/testing'
import { restriccionViolada } from '../src/servidor/esquema/restricciones.ts'

export const PgTest = PgClient.layerConfig({ url: Config.Redacted('DATABASE_URL_TEST'), maxConnections: Config.succeed(4) })

class Revertir<A, E> {
  constructor(readonly resultado: Effect.Effect<A, E>) {}
}

export const enRollback = <A, E, R>(prueba: Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const fin = yield* Effect.flip(sql.withTransaction(Effect.flatMap(Effect.exit(prueba), (exit) => Effect.fail(new Revertir(exit)))))
    return yield* fin instanceof Revertir ? fin.resultado : Effect.fail(fin)
  })

export const restriccionDe = <A, E, R>(efecto: Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    return yield* sql.withTransaction(efecto).pipe(
      Effect.as(Option.none<string>()),
      Effect.catchIf(SqlError.isSqlError, (e) => Effect.succeed(restriccionViolada(e))),
    )
  })

const ConId = Schema.NonEmptyArray(Schema.Struct({ id: Schema.Int }))

export const idDe = <E, R>(consulta: Effect.Effect<ReadonlyArray<unknown>, E, R>) =>
  consulta.pipe(
    Effect.flatMap(Schema.decodeUnknownEffect(ConId)),
    Effect.map(([fila]) => fila.id),
  )

/**
 * Runs `efecto` with its clock stopped at `dia`. The clock is a fresh one: moving the layer's shared
 * TestClock decades forward would fire the connection pool's timers and hang the test.
 */
export const elDia =
  (dia: Date) =>
  <A, E, R>(efecto: Effect.Effect<A, E, R>) =>
    Effect.andThen(TestClock.setTime(dia.getTime()), efecto).pipe(Effect.provide(TestClock.layer()))
