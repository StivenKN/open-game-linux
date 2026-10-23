import { createFileRoute } from '@tanstack/react-router'
import { gameImage } from '../-game-image.ts'

export const Route = createFileRoute('/juegos/$gameId_/badge.svg')({
  server: {
    handlers: {
      GET: ({ request, params }) =>
        gameImage(request, params.gameId, 'image/svg+xml; charset=utf-8', async (card, t) => {
          // Imported here so satori loads only when an image is asked for.
          const { badgeSvg } = await import('../../images/render.tsx')
          return badgeSvg(card, t)
        }),
    },
  },
})
