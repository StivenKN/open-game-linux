// Following a game is in-app only: the app has no mail channel. A follow stores only when its user last
// looked (`seen_at`); what changed since is computed from the approved reports on each request.
import { Schema } from 'effect'
import { type ApprovedTest, type CompatibilityStatus, summarize } from './compatibility.ts'
import { GameId } from './ids.ts'

/**
 * The follow button and "Marcar como visto". `Visto` carries the page's watermark, the database instant read
 * before its approved tests, so a report approved while the page sat open is still news afterwards.
 */
export const FollowChange = Schema.Union([
  Schema.TaggedStruct('Seguir', { game_id: GameId }),
  Schema.TaggedStruct('Dejar', { game_id: GameId }),
  Schema.TaggedStruct('Visto', { game_id: GameId, seen_at: Schema.DateFromString }),
])
export type FollowChange = typeof FollowChange.Type

export type News = {
  /** Reports approved after the follower last looked that still count. */
  readonly approved: number
  /** The state they last saw, computed from what was approved by then, when it differs from the state now. */
  readonly previous_status: CompatibilityStatus | null
}

/**
 * What a follower who last looked at `seenAt` has not seen, from the game's approved tests now. A report
 * retired since then counts in neither state; one approved since then counts only now.
 */
export const newsSince = (tests: ReadonlyArray<ApprovedTest>, seenAt: Date, now: Date): News => {
  const seen = tests.filter((p) => p.reviewed_at.getTime() <= seenAt.getTime())
  const previous = summarize(seen, seenAt).status
  return { approved: tests.length - seen.length, previous_status: previous === summarize(tests, now).status ? null : previous }
}

export const hasNews = (news: News): boolean => news.approved > 0 || news.previous_status !== null
