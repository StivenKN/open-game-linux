import { Clock, Effect, Option, Struct } from 'effect'
import { SqlClient } from 'effect/sql'
import { summarize } from '../../domain/compatibility.ts'
import { hasNews, newsSince } from '../../domain/follow.ts'
import type { UserId } from '../../domain/ids.ts'
import { Game, GameFollow } from '../../domain/tables.ts'
import { requireUser, Visitor } from '../auth.ts'
import { rows } from '../rows.ts'
import { approvedTests, seenWatermark } from './game.ts'

const FollowRow = GameFollow.mapFields(Struct.pick(['game_id', 'seen_at', 'created_at'])).mapFields(Struct.assign({ title: Game.fields.title }))

/** The games a user follows, each with its state now and its news, those with news first. */
const followed = (user: UserId) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const now = new Date(yield* Clock.currentTimeMillis)
    const asOf = yield* seenWatermark
    const follows = yield* rows(
      FollowRow,
      sql`SELECT f.game_id, f.seen_at, f.created_at, g.title
          FROM game_follow f JOIN game g ON g.id = f.game_id
          WHERE f.user_id = ${user}
          ORDER BY g.title, g.id`,
    )
    const tests = yield* approvedTests({ followedBy: user })
    const games = follows.map((f) => {
      const own = tests.filter((p) => p.game_id === f.game_id)
      return { ...f, status: summarize(own, now).status, news: newsSince(own, f.seen_at, now) }
    })
    // Array.sort is stable, so the title order holds within each half.
    return { as_of: asOf, games: games.sort((a, b) => Number(hasNews(b.news)) - Number(hasNews(a.news))) }
  })

/** The "Seguidos" page. */
export const myFollows = Effect.flatMap(requireUser, (u) => followed(u.id))

/** What every page's header needs: the visitor, and how many followed games have news (0 for guests). */
export const session = Effect.gen(function* () {
  const visitor = yield* Visitor
  if (Option.isNone(visitor)) return { visitor: null, followed_news: 0 }
  const { games } = yield* followed(visitor.value.id)
  return { visitor: visitor.value, followed_news: games.filter((g) => hasNews(g.news)).length }
})
