import { count } from '../../format.ts'
import type { sources as source } from '../es/sources.tsx'

const reports = (n: number) => count(n, 'report', 'reports')
const working = (n: number, total: number) => (total === 0 ? 'no reports' : `${n} of ${reports(total)} ${n === 1 ? 'says' : 'say'} it works`)

export const sources = {
  protondb: {
    attribution: (
      <>
        Data from <a href="https://www.protondb.com">ProtonDB</a>, licensed under <a href="https://opendatacommons.org/licenses/odbl/">ODbL</a>.
      </>
    ),
    line: (n, total, allTime) => (total === 0 ? `ProtonDB: no reports in the last year (${allTime} in total)` : `ProtonDB: ${working(n, total)} in the last year`),
    heading: 'Other sources: ProtonDB',
    empty: 'No ProtonDB data for this game yet.',
    intro: "Reports from the ProtonDB community about the Steam edition. They are another source: they don't count toward OpenGame's state.",
    lastYear: (n, total) => (
      <>
        Last year: <b>{working(n, total)}</b>
      </>
    ),
    modest: (n, total) => (
      <>
        On modest machines (8 GB of RAM or less, or integrated Intel graphics): <b>{working(n, total)}</b>
      </>
    ),
    total: (n, latest) => `${reports(n)} in total · last report ${latest}`,
    mostUsed: (layer, n) => (
      <>
        Most used among those that work: <b>{layer}</b> ({reports(n)})
      </>
    ),
    window: (exported) => `“Last year” is the 12 months before the ProtonDB export of ${exported}.`,
    viewGame: 'See the game on ProtonDB',
  },
  anticheat: {
    attribution: (
      <>
        Data from <a href="https://areweanticheatyet.com">AreWeAntiCheatYet</a>, licensed under{' '}
        <a href="https://github.com/AreWeAntiCheatYet/AreWeAntiCheatYet/blob/master/LICENSE">MIT</a>.
      </>
    ),
    line: (status) => `${status}, according to AreWeAntiCheatYet`,
    heading: 'Other sources: AreWeAntiCheatYet',
    empty: 'No AreWeAntiCheatYet data for this game. OpenGame looks it up in that list by the id of its Steam edition.',
    intro:
      "What the AreWeAntiCheatYet community list knows about the Steam edition's anti-cheat on Linux. It is another source: it doesn't count toward OpenGame's state.",
    anticheats: (names) => <>Anti-cheat: {names}</>,
    changed: (date) => `Last updated in the list: ${date}`,
    viewGame: 'See the game on AreWeAntiCheatYet',
  },
} satisfies typeof source
