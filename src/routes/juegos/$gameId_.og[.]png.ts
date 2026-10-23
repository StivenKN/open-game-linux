import { createFileRoute } from '@tanstack/react-router'
import { gameImage } from '../-game-image.ts'

export const Route = createFileRoute('/juegos/$gameId_/og.png')({
  server: {
    handlers: {
      GET: ({ params }) =>
        gameImage(params.gameId, 'image/png', async (card) => {
          // Imported here so satori and the native resvg load only when an image is asked for.
          const { gamePreviewPng } = await import('../../images/render.tsx')
          return gamePreviewPng(card)
        }),
    },
  },
})
