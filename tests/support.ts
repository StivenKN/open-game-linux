import { Config, Effect, Option, Schema } from 'effect'
import { PgClient } from '@effect/sql-pg'
import { SqlClient, SqlError } from 'effect/sql'
import { TestClock } from 'effect/testing'
import { violatedConstraint } from '../src/server/schema/constraints.ts'

export const PgTest = PgClient.layerConfig({ url: Config.Redacted('DATABASE_URL_TEST'), maxConnections: Config.succeed(4) })

class Rollback<A, E> {
  constructor(readonly outcome: Effect.Effect<A, E>) {}
}

export const inRollback = <A, E, R>(test: Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const end = yield* Effect.flip(sql.withTransaction(Effect.flatMap(Effect.exit(test), (exit) => Effect.fail(new Rollback(exit)))))
    return yield* end instanceof Rollback ? end.outcome : Effect.fail(end)
  })

export const constraintOf = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    return yield* sql.withTransaction(effect).pipe(
      Effect.as(Option.none<string>()),
      Effect.catchIf(SqlError.isSqlError, (e) => Effect.succeed(violatedConstraint(e))),
    )
  })

const IdRow = Schema.NonEmptyArray(Schema.Struct({ id: Schema.Int }))

export const idOf = <E, R>(query: Effect.Effect<ReadonlyArray<unknown>, E, R>) =>
  query.pipe(
    Effect.flatMap(Schema.decodeUnknownEffect(IdRow)),
    Effect.map(([row]) => row.id),
  )

/**
 * Runs `efecto` with its clock stopped at `dia`. The clock is a fresh one: moving the layer's shared
 * TestClock decades forward would fire the connection pool's timers and hang the test.
 */
export const onDay =
  (day: Date) =>
  <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    Effect.andThen(TestClock.setTime(day.getTime()), effect).pipe(Effect.provide(TestClock.layer()))
