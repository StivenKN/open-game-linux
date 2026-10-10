import { Effect, Option, Schema } from 'effect'
import { SqlClient, SqlSchema } from 'effect/sql'
import { Reporte, ReporteNoEncontrado } from './domain.ts'

export const listarReportes = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  return yield* SqlSchema.findAll({
    Request: Schema.Void,
    Result: Reporte,
    execute: () => sql`SELECT id, titulo, estado_revision, evidencia_revision FROM reporte ORDER BY id`,
  })(undefined)
})

export const obtenerReporte = (id: bigint) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const row = yield* SqlSchema.findOneOption({
      Request: Schema.BigInt,
      Result: Reporte,
      execute: (id) => sql`SELECT id, titulo, estado_revision, evidencia_revision FROM reporte WHERE id = ${id}`,
    })(id)
    return yield* Option.match(row, {
      onNone: () => Effect.fail(new ReporteNoEncontrado({ id })),
      onSome: Effect.succeed,
    })
  })
