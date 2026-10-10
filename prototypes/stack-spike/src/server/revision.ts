import { Effect } from 'effect'
import { SqlClient, SqlError } from 'effect/sql'
import { ReglaRevisionViolada } from './domain.ts'

// The driver error (code, constraint, message, detail) sits untyped on reason.cause.
type PgErrorFields = { code?: string; constraint?: string; message?: string }

// Maps a Postgres CHECK / trigger rejection (SQLSTATE 23514) to the domain error by constraint name.
const mapRegla = (e: SqlError.SqlError) => {
  const pg = e.reason.cause as PgErrorFields
  return e.reason._tag === 'ConstraintError' &&
    (pg.constraint === 'reporte_bloque_revision' || pg.constraint === 'og_solo_revision')
    ? new ReglaRevisionViolada({ regla: pg.constraint, mensaje: pg.message ?? '' })
    : e
}

export const aprobarSinEvidencia = (id: bigint) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* sql`UPDATE reporte SET estado_revision = 'aprobado', evidencia_revision = '  ' WHERE id = ${id}`
  }).pipe(Effect.mapError(mapRegla))

export const reescribirAprobado = (id: bigint) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* sql`UPDATE reporte SET titulo = 'reescrito' WHERE id = ${id}`
  }).pipe(Effect.mapError(mapRegla))
