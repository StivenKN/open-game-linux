import { count } from '../../format.ts'
import type { share as source } from '../es/share.ts'

const basedOn = (n: number) => `Based on ${count(n, 'approved report', 'approved reports')}`

export const share = {
  site: {
    imageAlt: 'OpenGame Linux: take your Windows library to Linux.',
    heading: 'Take your Windows library to Linux.',
    lede: 'How it went for players who already tried each game, from the reports a reviewer approved.',
  },
  game: {
    title: (game, status) => `${game} on Linux: ${status}`,
    noReports: 'No approved reports yet. Did you play it on Linux? Tell us how it went.',
    reports: (n, noRecent) => `${basedOn(n)} from players on Linux.${noRecent ? ' No confirmation in the last year.' : ''}`,
    demo: 'Demo data, from demo accounts.',
  },
  image: {
    gameNotFound: "We couldn't find that game.",
    noReports: 'No approved reports yet',
    basedOn,
    demoNote: 'demo data',
  },
  embed: {
    heading: 'Share',
    intro: "Put this game's state in a README, a forum or your site. The badge follows the computed state: it changes on its own when a reviewer approves new reports.",
    alt: (game) => `State of ${game} on OpenGame Linux`,
    badgeAlt: (status, demo) => `Badge: OpenGame Linux, ${status}${demo ? ', demo data' : ''}`,
  },
} satisfies typeof source
