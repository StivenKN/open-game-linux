import type { CompatibilityStatus } from '../../domain/compatibility.ts'
import type { GameId } from '../../domain/ids.ts'
import { compatibilityStatus } from '../vocabulary.ts'
import { CopyBox } from './CopyBox.tsx'

type Game = { readonly id: GameId; readonly title: string }

/** The Markdown and HTML that show a game's status badge on another site, linked to its page. */
export const embedCodes = (origin: string, game: Game) => {
  const page = `${origin}/juegos/${game.id}`
  const badge = `${page}/badge.svg`
  const alt = `Estado de ${game.title} en OpenGame Linux`
  return {
    markdown: `[![${alt.replace(/[\\[\]]/g, '\\$&')}](${badge})](${page})`,
    html: `<a href="${page}"><img src="${badge}" alt="${alt.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;')}" height="22"></a>`,
  }
}

/** The game page's "Compartir" block: the live badge, then the codes that embed it. */
export function Embed({ origin, game, status, demo }: { origin: string; game: Game; status: CompatibilityStatus; demo: boolean }) {
  const { markdown, html } = embedCodes(origin, game)
  return (
    <div className="stack">
      <img src={`/juegos/${game.id}/badge.svg`} alt={`Insignia: OpenGame Linux, ${compatibilityStatus[status].text}${demo ? ', datos de ejemplo' : ''}`} height={22} />
      <div className="columns-2">
        <CopyBox label="Markdown" text={markdown} />
        <CopyBox label="HTML" text={html} />
      </div>
    </div>
  )
}
