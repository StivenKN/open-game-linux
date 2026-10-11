// Shared DB test support. Every test runs inside a transaction that is always rolled back, so tests
// never see each other's rows and need no cleanup. The DB is migrated once by tests/preparar.ts
// (vitest globalSetup), which refuses any DATABASE_URL whose database name does not end in "_test".
import { Data, Effect, Exit, Option, Redacted, Ref, Schema } from 'effect'
import { PgClient } from '@effect/sql-pg'
import { SqlClient, SqlError } from 'effect/sql'
import { Visitante, type Usuario } from '../src/servidor/auth.ts'

const url = process.env.TEST_DATABASE_URL ?? 'postgres://opengame:opengame@localhost:55432/opengame_test'
export const PgTest = PgClient.layer({ url: Redacted.make(url) })

class Revertir extends Data.TaggedError('Revertir')<{}> {}

/** Runs `prueba` in a transaction that is always rolled back; returns the test's own Exit. */
export const enRollback = <A, E>(prueba: Effect.Effect<A, E, SqlClient.SqlClient | Visitante>, como: Option.Option<Usuario> = Option.none()) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const resultado = yield* Ref.make<Option.Option<Exit.Exit<A, E>>>(Option.none())
    yield* sql
      .withTransaction(Effect.exit(prueba).pipe(Effect.tap((e) => Ref.set(resultado, Option.some(e))), Effect.andThen(Effect.fail(new Revertir()))))
      .pipe(Effect.catchTag('Revertir', () => Effect.void))
    return yield* Ref.get(resultado).pipe(Effect.flatMap(Option.match({ onNone: () => Effect.die('sin resultado'), onSome: Effect.succeed })))
  }).pipe(Effect.provideService(Visitante, como), Effect.provide(PgTest))

/**
 * The constraint name a statement violated, decoded from SqlError.reason.cause (spike Q5).
 * Option.none() when the statement succeeded or failed for another reason.
 */
export const restriccionViolada = (e: SqlError.SqlError): Option.Option<string> =>
  Schema.decodeUnknownOption(Schema.Struct({ constraint: Schema.String }))(e.reason.cause).pipe(Option.map((c) => c.constraint))
