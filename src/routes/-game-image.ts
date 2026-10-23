// The two image routes of a game, badge.svg and og.png. Server handlers only: the router never renders them.
import { Option } from 'effect'
import { GameId } from '../domain/ids.ts'
import type { GameCard } from '../images/render.tsx'
import { gameCard } from '../server/queries/share.ts'
import { runRead } from '../server/run.ts'
import type { Messages } from '../ui/i18n/es.ts'
import { imageLang } from '../ui/i18n/lang.ts'
import { messages } from '../ui/i18n/messages.ts'
import { routeId } from './-ids.ts'

const gameId = routeId(GameId)

/**
 * Answers with `draw` applied to the game's card, in the language of the request's `?lang=`, or 404 when the
 * segment names no game. The state is computed on each request and changes with the next approval, so
 * caches keep the image five minutes only.
 */
export const gameImage = async (request: Request, segment: string, contentType: string, draw: (card: GameCard, t: Messages) => Promise<BodyInit>) => {
  const t = messages[imageLang(new URL(request.url))]
  const id = gameId(segment)
  const card = Option.isSome(id) ? await runRead(gameCard(id.value)) : Option.none()
  if (Option.isNone(card)) return new Response(t.notFound.title, { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } })
  return new Response(await draw(card.value, t), { headers: { 'content-type': contentType, 'cache-control': 'public, max-age=300' } })
}
