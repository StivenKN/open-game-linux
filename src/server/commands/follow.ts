import { Effect, Schema } from 'effect'
import { SqlClient } from 'effect/sql'
import type { FollowChange } from '../../domain/follow.ts'
import type { UserId } from '../../domain/ids.ts'
import { requireUser } from '../auth.ts'
import { rows } from '../rows.ts'
import type { Write } from './contributions.ts'

const Changed = Schema.Struct({ game_id: Schema.Int })

const statementOf = (sql: SqlClient.SqlClient, user: UserId, change: FollowChange) => {
  switch (change._tag) {
    case 'Seguir':
      return sql`INSERT INTO game_follow (user_id, game_id) SELECT ${user}, id FROM game WHERE id = ${change.game_id}
                 ON CONFLICT DO NOTHING RETURNING game_id`
    case 'Dejar':
      return sql`DELETE FROM game_follow WHERE user_id = ${user} AND game_id = ${change.game_id} RETURNING game_id`
    case 'Visto':
      return sql`UPDATE game_follow SET seen_at = LEAST(${change.seen_at}, now())
                 WHERE user_id = ${user} AND game_id = ${change.game_id} AND seen_at < LEAST(${change.seen_at}, now())
                 RETURNING game_id`
  }
}

/**
 * The single writer of game_follow, for the signed-in visitor's own follows. Idempotent: following twice
 * keeps the first `seen_at`, and leaving or marking a game nobody follows changes nothing. `Visto` moves
 * `seen_at` forward only, and never past now, so a stale page cannot hide what was approved after it.
 */
export const changeFollow = (change: FollowChange): Write<{ readonly changed: boolean }, never> =>
  Effect.gen(function* () {
    const user = yield* requireUser
    const sql = yield* SqlClient.SqlClient
    const changed = yield* rows(Changed, statementOf(sql, user.id, change))
    return { changed: changed.length > 0 }
  })
