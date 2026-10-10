// Shared DB test support. Every test runs inside a transaction that is always rolled back, so tests
// never see each other's rows and need no cleanup. tests/preparar.ts migrates the database once per run.
import { Config, Effect, Option, Schema } from 'effect'
import { PgClient } from '@effect/sql-pg'
import { SqlClient, SqlError } from 'effect/sql'
import { restriccionViolada } from '../src/servidor/esquema/restricciones.ts'

export const PgTest = PgClient.layerConfig({ url: Config.Redacted('DATABASE_URL_TEST'), maxConnections: Config.succeed(4) })

class Revertir<A, E> {
  constructor(readonly resultado: Effect.Effect<A, E>) {}
}

/** Runs `prueba` in a transaction that is always rolled back, then replays the test's own outcome. */
export const enRollback = <A, E, R>(prueba: Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const fin = yield* Effect.flip(sql.withTransaction(Effect.flatMap(Effect.exit(prueba), (exit) => Effect.fail(new Revertir(exit)))))
    return yield* fin instanceof Revertir ? fin.resultado : Effect.fail(fin)
  })

/**
 * The constraint the database refused `efecto` with, or none when it was accepted or failed otherwise.
 * Runs in a savepoint (nested withTransaction), so the test transaction stays usable afterwards.
 */
export const restriccionDe = <A, E, R>(efecto: Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    return yield* sql.withTransaction(efecto).pipe(
      Effect.as(Option.none<string>()),
      Effect.catchIf(SqlError.isSqlError, (e) => Effect.succeed(restriccionViolada(e))),
    )
  })

const ConId = Schema.NonEmptyArray(Schema.Struct({ id: Schema.Int }))

/** The id of the row an `INSERT ... RETURNING id` created. */
export const idDe = <E, R>(consulta: Effect.Effect<ReadonlyArray<unknown>, E, R>) =>
  consulta.pipe(
    Effect.flatMap(Schema.decodeUnknownEffect(ConId)),
    Effect.map(([fila]) => fila.id),
  )
