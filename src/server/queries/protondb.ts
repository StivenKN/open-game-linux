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
        SELECT p.*, e.game_id, e.external_id AS app_id
        FROM protondb_summary p JOIN game_edition e ON e.id = p.edition_id
        WHERE ${sql.and(game === null ? [] : [sql`e.game_id = ${game}`])}`,
    ),
  )
