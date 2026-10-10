import { Effect } from 'effect'
import { SqlClient } from 'effect/sql'
import { PgLive } from '../src/server/db.ts'
import { listarReportes } from '../src/server/reportes.ts'

const program = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  const raw = yield* sql`SELECT id, titulo, estado_revision FROM reporte ORDER BY id`
  console.log('raw rows', raw, 'typeof id =', typeof raw[0]!.id)
  console.log('decoded', yield* listarReportes)
  // Put a value outside the union: drop the CHECK first in a transaction, then roll back.
  yield* sql.withTransaction(
    Effect.gen(function* () {
      yield* sql`ALTER TABLE reporte DROP CONSTRAINT reporte_estado_revision_check`
      yield* sql`UPDATE reporte SET estado_revision = 'borrador' WHERE id = 2`
      const exit = yield* Effect.exit(listarReportes)
      console.log('bad union exit tag', exit._tag)
      if (exit._tag === 'Failure') console.log('pretty', exit.cause.reasons.map((r) => r._tag === 'Fail' ? String(r.error.message) : r._tag))
      return yield* Effect.fail('rollback' as const)
    }),
  ).pipe(Effect.ignore)
})

Effect.runPromise(program.pipe(Effect.provide(PgLive))).then(() => process.exit(0), (e) => (console.error(e), process.exit(1)))
