import { Effect } from 'effect'
import { SqlClient, SqlError } from 'effect/sql'
import { PgLive } from '../src/server/db.ts'
import { aprobarSinEvidencia, reescribirAprobado } from '../src/server/revision.ts'

const show = (label: string, e: unknown) => {
  if (!SqlError.isSqlError(e)) return console.log(label, 'NOT SqlError', e)
  const reason = e.reason
  console.log(label, {
    errorTag: e._tag,
    reasonTag: reason._tag,
    reasonKeys: Object.keys(reason),
    message: reason.message,
    // the underlying driver error is in reason.cause
    causeKeys: Object.keys(reason.cause as object),
    cause: reason.cause,
  })
}

const program = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  const a = yield* Effect.flip(sql`UPDATE reporte SET estado_revision = 'aprobado', evidencia_revision = '   ' WHERE id = 2`)
  show('CHECK violation', a)
  const b = yield* Effect.flip(sql`UPDATE reporte SET titulo = 'reescrito' WHERE id = 1`)
  show('TRIGGER violation', b)
  console.log('mapped CHECK ->', yield* Effect.flip(aprobarSinEvidencia(2n)))
  console.log('mapped TRIGGER ->', yield* Effect.flip(reescribirAprobado(1n)))
})

Effect.runPromise(program.pipe(Effect.provide(PgLive))).then(() => process.exit(0), (e) => (console.error(e), process.exit(1)))
