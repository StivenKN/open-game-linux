import { count } from '../../format.ts'
import type { catalog as source } from '../es/catalog.tsx'

export const catalog = {
  title: 'Catalog',
  heading: 'Take your Windows library to Linux.',
  lede: 'Search for a game and see how it went for players who already tried it, on their distribution and with their setup. Only what a reviewer approved counts, and the state uses the last year of reports when there are any.',
  searchLabel: 'Search for a game by title',
  searchPlaceholder: 'What do you want to play?',
  search: 'Search',
  suggestions: 'Try:',
  figures: (c) => (
    <>
      So far there are <b>{count(c.approved_reports, 'approved report', 'approved reports')}</b> on{' '}
      <b>{count(c.verified_games, 'verified game', 'verified games')}</b>, across{' '}
      <b>{count(c.tested_distributions, 'distribution', 'distributions')}</b>, with{' '}
      <b>{count(c.approved_profiles, 'configuration profile', 'configuration profiles')}</b> to copy and{' '}
      <b>{count(c.upstream_fixes, 'accepted fix', 'accepted fixes')}</b> in umu-protonfixes.
    </>
  ),
  filters: 'Filters',
  status: 'State',
  launcher: 'Launcher',
  active: { query: (q) => `“${q}”`, noAntiCheatBlock: 'no anti-cheat block', steamDeck: 'tested on Steam Deck' },
  noAntiCheatBlock: {
    title: 'No anti-cheat block',
    help: 'Hides games with reports blocked by an anti-cheat, and those AreWeAntiCheatYet marks as broken or denied.',
  },
  steamDeck: { title: 'Tested on Steam Deck', help: 'Only games with an approved report that works on a Steam Deck.' },
  games: (n) => count(n, 'game', 'games'),
  gamesNoun: (n) => (n === 1 ? 'game' : 'games'),
  inCatalog: 'in the catalog',
  clearFilters: 'Clear filters',
  noMatch: 'No game matches these filters. Remove one or search for another title.',
  empty: 'There are no games in the catalog yet.',
  requestMissing: 'Not here? Request it',
  requestNearMiss: 'None of these? Request it',
  card: {
    tested: (n, last) => `${count(n, 'approved report', 'approved reports')} · last test ${last}`,
    untested: 'Nobody has approved a test yet',
    noRecent: 'No confirmation in the last year',
    pending: (n) => (n === 1 ? '1 report awaits review and does not count' : `${n} reports await review and do not count`),
  },
} satisfies typeof source
