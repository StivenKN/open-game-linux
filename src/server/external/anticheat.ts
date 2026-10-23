// Single writer of anticheat_entry. Like the ProtonDB import, the list is read whole before the database is
// touched, then every row is replaced in one transaction: a rerun converges, a failed read changes nothing.
import { Array as Arr, Effect, Option } from 'effect'
import { SqlClient } from 'effect/sql'
import { type ListedGame, parseListedGame, preferred } from '../../domain/anticheat.ts'
import type { EditionId } from '../../domain/ids.ts'
import type { AntiCheatEntry } from '../../domain/tables.ts'
import { arrayElements } from './protondb.ts'
import { InvalidExport, readInput, recordImport, steamEditions } from './sources.ts'

export type AntiCheatImport = {
  readonly read: number
  readonly discarded: number
  readonly matched: number
  readonly saved: number
}

const readList = async (chunks: AsyncIterable<string>, editions: ReadonlyMap<string, EditionId>) => {
  let read = 0
  let discarded = 0
  let matched = 0
  const byEdition = new Map<EditionId, ListedGame>()
  for await (const text of arrayElements(chunks)) {
    read++
    const game = Option.getOrNull(parseListedGame(text))
    if (game === null) {
      discarded++
      continue
    }
    const edition = game.app_id === null ? undefined : editions.get(game.app_id)
    if (edition === undefined) continue
    matched++
    const other = byEdition.get(edition)
    byEdition.set(edition, other === undefined ? game : preferred(other, game))
  }
  return { read, discarded, matched, byEdition }
}

/**
 * Stores AreWeAntiCheatYet's entry for each catalog Steam edition from its games.json, replacing the last
 * import. `file` is the list's blob sha when `--latest` downloaded it, else null (see `recordImport`).
 */
export const importAntiCheat = (chunks: AsyncIterable<string>, file: string | null) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const steam = yield* steamEditions
    const parsed = yield* readInput(() => readList(chunks, new Map(steam.map((e) => [e.app_id, e.id]))))
    if (parsed.read === parsed.discarded) return yield* new InvalidExport({ reason: 'ningún juego válido' })
    const entries = [...parsed.byEdition].map(
      ([edition_id, { status, anticheats, changed_at, slug }]): AntiCheatEntry => ({ edition_id, status, anticheats, changed_at, slug }),
    )

    yield* sql.withTransaction(
      Effect.gen(function* () {
        yield* sql`LOCK TABLE anticheat_entry IN EXCLUSIVE MODE`
        yield* sql`DELETE FROM anticheat_entry`
        for (const batch of Arr.chunksOf(entries, 500)) yield* sql`INSERT INTO anticheat_entry ${sql.insert(batch)}`
        yield* recordImport('anticheat', file, steam)
      }),
    )

    return { read: parsed.read, discarded: parsed.discarded, matched: parsed.matched, saved: entries.length } satisfies AntiCheatImport
  })

const numberFormat = new Intl.NumberFormat('es-CO')

export const antiCheatSummary = (r: AntiCheatImport): string =>
  `AreWeAntiCheatYet: ${numberFormat.format(r.read)} juegos leídos, ${numberFormat.format(r.discarded)} descartados, ` +
  `${numberFormat.format(r.matched)} del catálogo. ${numberFormat.format(r.saved)} ediciones de Steam guardadas; ` +
  `la lista anterior fue reemplazada.`
