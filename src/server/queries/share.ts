import { Clock, Effect, Option, Struct } from 'effect'
import { SqlClient, SqlSchema } from 'effect/sql'
import { summarize } from '../../domain/compatibility.ts'
import { GameId } from '../../domain/ids.ts'
import { Game } from '../../domain/tables.ts'
import { approvedTests } from './game.ts'

/**
 * What a game's badge and preview image show: its title, and its computed state and approved reports as
 * its catalog card counts them. None when the id names no game.
 */
export const gameCard = (gameId: GameId) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const game = yield* SqlSchema.findOneOption({
      Request: GameId,
      Result: Game.mapFields(Struct.pick(['title'])),
      execute: (id) => sql`SELECT title FROM game WHERE id = ${id}`,
    })(gameId)
    if (Option.isNone(game)) return Option.none()
    const now = new Date(yield* Clock.currentTimeMillis)
    const { status, test_count, no_recent_confirmation } = summarize(yield* approvedTests({ game: gameId }), now)
    return Option.some({ title: game.value.title, status, reports: test_count, no_recent_confirmation })
  })
