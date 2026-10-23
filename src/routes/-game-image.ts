// The two image routes of a game, badge.svg and og.png. Server handlers only: the router never renders them.
import { Option } from 'effect'
import { GameId } from '../domain/ids.ts'
import type { GameCard } from '../images/render.tsx'
import { gameCard } from '../server/queries/share.ts'
import { runRead } from '../server/run.ts'
import { routeId } from './-ids.ts'

const gameId = routeId(GameId)

/**
 * Answers with `draw` applied to the game's card, or 404 when the segment names no game. The state is
 * computed on each request and changes with the next approval, so caches keep the image five minutes only.
 */
export const gameImage = async (segment: string, contentType: string, draw: (card: GameCard) => Promise<BodyInit>) => {
  const id = gameId(segment)
  const card = Option.isSome(id) ? await runRead(gameCard(id.value)) : Option.none()
  if (Option.isNone(card)) return new Response('No encontramos ese juego.', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } })
  return new Response(await draw(card.value), { headers: { 'content-type': contentType, 'cache-control': 'public, max-age=300' } })
}
