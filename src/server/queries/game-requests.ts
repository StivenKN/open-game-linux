import { Effect, Option, Schema, Struct } from 'effect'
import { SqlClient } from 'effect/sql'
import { RequiredText } from '../../domain/ids.ts'
import { Game, GameRequest } from '../../domain/tables.ts'
import { Visitor } from '../auth.ts'
import { rows } from '../rows.ts'
import { isDemo } from './labels.ts'

const OpenRequest = Schema.Struct({
  ...GameRequest.mapFields(Struct.pick(['id', 'title', 'steam_app_id', 'created_at'])).fields,
  requesters: Schema.Int,
  mine: Schema.Boolean,
  // Only demo accounts ask for it.
  demo: Schema.Boolean,
})

const myRequest = { ...GameRequest.mapFields(Struct.pick(['id', 'title'])).fields, requesters: Schema.Int }

// Tagged by status, as the table's resolution CHECK shapes it, so the page reads no column that cannot be set.
const MyRequest = Schema.Union([
  Schema.Struct({ ...myRequest, status: Schema.Literal('abierto') }),
  Schema.Struct({ ...myRequest, status: Schema.Literal('cumplido'), game_id: Game.fields.id, game: Game.fields.title, resolved_at: Schema.Date }),
  Schema.Struct({ ...myRequest, status: Schema.Literal('rechazado'), rejection_reason: RequiredText, resolved_at: Schema.Date }),
])

/** The requests page: every open request, most requested first, and the visitor's own requests in any state. */
export const gameRequests = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  const me = Option.getOrNull(Option.map(yield* Visitor, (u) => u.id))
  const open = yield* rows(
    OpenRequest,
    sql`SELECT r.id, r.title, r.steam_app_id, r.created_at, count(*)::int AS requesters,
               COALESCE(bool_or(u.user_id = ${me}), false) AS mine, bool_and(${sql.literal(isDemo('a'))}) AS demo
        FROM game_request r
        JOIN game_request_user u ON u.request_id = r.id
        JOIN app_user a ON a.id = u.user_id
        WHERE r.status = 'abierto'
        GROUP BY r.id
        ORDER BY requesters DESC, r.created_at, r.id`,
  )
  const mine =
    me === null
      ? []
      : yield* rows(
          MyRequest,
          sql`SELECT r.id, r.title, r.status, r.rejection_reason, r.game_id, r.resolved_at, g.title AS game,
                     (SELECT count(*)::int FROM game_request_user c WHERE c.request_id = r.id) AS requesters
              FROM game_request r
              JOIN game_request_user u ON u.request_id = r.id AND u.user_id = ${me}
              LEFT JOIN game g ON g.id = r.game_id
              ORDER BY u.created_at DESC, r.id DESC`,
        )
  return { open, mine }
})
