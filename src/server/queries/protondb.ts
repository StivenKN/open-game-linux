import { Effect, Schema } from 'effect'
import { SqlClient } from 'effect/sql'
import { JuegoId } from '../../domain/ids.ts'
import { ProtonDbResumen } from '../../domain/tables.ts'
import { filas } from '../rows.ts'

const FilaProtonDb = Schema.Struct({ ...ProtonDbResumen.fields, juego_id: JuegoId, app_id: Schema.String })
export type FilaProtonDb = typeof FilaProtonDb.Type

/** ProtonDB's aggregate per game, from its Steam edition: one game, or every game with `null`. */
export const resumenesProtonDb = (juego: JuegoId | null) =>
  Effect.flatMap(SqlClient.SqlClient, (sql) =>
    filas(
      FilaProtonDb,
      sql`
        SELECT p.*, e.juego_id, e.identificador_externo AS app_id
        FROM protondb_resumen p JOIN edicion_juego e ON e.id = p.edicion_id
        WHERE ${sql.and(juego === null ? [] : [sql`e.juego_id = ${juego}`])}`,
    ),
  )
