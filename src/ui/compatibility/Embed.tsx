import type { CompatibilityStatus } from '../../domain/compatibility.ts'
import type { GameId } from '../../domain/ids.ts'
import type { Messages } from '../i18n/es.ts'
import { type Lang, langQuery } from '../i18n/lang.ts'
import { messages, useLang } from '../i18n/messages.ts'
import { CopyBox } from './CopyBox.tsx'

type Game = { readonly id: GameId; readonly title: string }

/**
 * The Markdown and HTML that show a game's status badge on another site, in `lang`. The badge links to the
 * unprefixed page, which opens in each reader's own language.
 */
export const embedCodes = (origin: string, game: Game, lang: Lang) => {
  const page = `${origin}/juegos/${game.id}`
  const badge = `${page}/badge.svg${langQuery(lang)}`
  const alt = messages[lang].share.embed.alt(game.title)
  return {
    markdown: `[![${alt.replace(/[\\[\]]/g, '\\$&')}](${badge})](${page})`,
    html: `<a href="${page}"><img src="${badge}" alt="${alt.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;')}" height="22"></a>`,
  }
}

const badgeAlt = (t: Messages, status: CompatibilityStatus, demo: boolean) => t.share.embed.badgeAlt(t.compatibilityStatus[status].text, demo)

/** The game page's "Compartir" block: the live badge, then the codes that embed it. */
export function Embed({ origin, game, status, demo }: { origin: string; game: Game; status: CompatibilityStatus; demo: boolean }) {
  const lang = useLang()
  const { markdown, html } = embedCodes(origin, game, lang)
  return (
    <div className="stack">
      <img src={`/juegos/${game.id}/badge.svg${langQuery(lang)}`} alt={badgeAlt(messages[lang], status, demo)} height={22} />
      <div className="columns-2">
        <CopyBox label="Markdown" text={markdown} />
        <CopyBox label="HTML" text={html} />
      </div>
    </div>
  )
}
