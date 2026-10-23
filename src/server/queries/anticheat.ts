import { Effect, Schema } from 'effect'
import { SqlClient } from 'effect/sql'
import { blocksOnlinePlay } from '../../domain/anticheat.ts'
import { GameId } from '../../domain/ids.ts'
import { AntiCheatEntry } from '../../domain/tables.ts'
import { rows } from '../rows.ts'

const AntiCheatRow = Schema.Struct({ ...AntiCheatEntry.fields, game_id: GameId })
export type AntiCheatRow = typeof AntiCheatRow.Type

/** AreWeAntiCheatYet's entry per game, from its Steam edition: one game, or every game with `null`. */
export const antiCheatEntries = (game: GameId | null) =>
  Effect.flatMap(SqlClient.SqlClient, (sql) =>
    rows(
      AntiCheatRow,
      sql`
        SELECT a.*, e.game_id
        FROM anticheat_entry a JOIN game_edition e ON e.id = a.edition_id
        WHERE ${sql.and(game === null ? [] : [sql`e.game_id = ${game}`])}`,
    ),
  )

/** AreWeAntiCheatYet's Broken or Denied by game: the catalog's anti-cheat filter and the library's "Te frenan" read it. */
export const onlinePlayBlocks = Effect.map(
  antiCheatEntries(null),
  (entries) => new Map(entries.flatMap(({ game_id, status }) => (blocksOnlinePlay(status) ? [[game_id, status] as const] : []))),
)
