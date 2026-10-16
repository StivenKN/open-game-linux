import { Effect, Schema } from 'effect'
import { SqlClient } from 'effect/sql'
import { GameId } from '../../domain/ids.ts'
import { ProtonDbSummary } from '../../domain/tables.ts'
import { rows } from '../rows.ts'

const ProtonDbRow = Schema.Struct({ ...ProtonDbSummary.fields, juego_id: GameId, app_id: Schema.String })
export type ProtonDbRow = typeof ProtonDbRow.Type

/** ProtonDB's aggregate per game, from its Steam edition: one game, or every game with `null`. */
export const protonDbSummaries = (game: GameId | null) =>
  Effect.flatMap(SqlClient.SqlClient, (sql) =>
    rows(
      ProtonDbRow,
      sql`
        SELECT p.*, e.juego_id, e.identificador_externo AS app_id
        FROM protondb_resumen p JOIN edicion_juego e ON e.id = p.edicion_id
        WHERE ${sql.and(game === null ? [] : [sql`e.juego_id = ${game}`])}`,
    ),
  )
