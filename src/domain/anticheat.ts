// AreWeAntiCheatYet's games.json as external evidence. Nothing here feeds ApprovedTest, statusOf or summarize.
import { Option, Schema } from 'effect'
import { AntiCheatStatus } from './literals.ts'
import { maxLengths } from './max-lengths.ts'
import { TextUpTo } from './tables.ts'

export type ListedGame = {
  readonly app_id: string | null
  readonly status: AntiCheatStatus
  readonly anticheats: ReadonlyArray<string>
  readonly changed_at: Date | null
  readonly slug: string
}

const ListEntry = Schema.Struct({
  slug: TextUpTo(maxLengths.anticheat_entry.slug),
  status: AntiCheatStatus,
  anticheats: Schema.Array(TextUpTo(maxLengths.anticheat_entry.anticheat)),
  storeIds: Schema.Struct({ steam: Schema.optionalKey(Schema.NullOr(Schema.String)) }),
  dateChanged: Schema.optionalKey(Schema.String),
})

const decode = Schema.decodeUnknownOption(Schema.fromJsonString(ListEntry))

// One entry in the October 2026 list dates itself "2025-10-30T04:00:000Z"; its status still counts.
const dateOf = (text: string | undefined): Date | null => {
  const time = text === undefined ? NaN : Date.parse(text)
  return Number.isNaN(time) ? null : new Date(time)
}

/** One element of games.json, as JSON text. None when it is not a usable entry. */
export const parseListedGame = (text: string): Option.Option<ListedGame> =>
  Option.map(decode(text), (e) => ({
    app_id: e.storeIds.steam?.trim() || null,
    status: e.status,
    anticheats: e.anticheats,
    changed_at: dateOf(e.dateChanged),
    slug: e.slug,
  }))

const changedTime = (g: ListedGame) => g.changed_at?.getTime() ?? -Infinity

/**
 * Two entries can name the same Steam app (a renamed game, a re-release). The most recently changed one wins,
 * and a tie goes to the first slug, so the same list always stores the same row.
 */
export const preferred = (a: ListedGame, b: ListedGame): ListedGame =>
  changedTime(b) > changedTime(a) || (changedTime(b) === changedTime(a) && b.slug < a.slug) ? b : a

/**
 * The statuses that keep a game out of "sin bloqueo anti-cheat", put the list's word on its catalog card,
 * and list a library game in "Te frenan".
 */
export const OnlinePlayBlock = AntiCheatStatus.pick(['Broken', 'Denied'])
export type OnlinePlayBlock = typeof OnlinePlayBlock.Type

export const blocksOnlinePlay = Schema.is(OnlinePlayBlock)
