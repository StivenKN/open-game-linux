import { createFileRoute } from '@tanstack/react-router'
import { MAX_JUEGOS_BIBLIOTECA } from '../domain/library.ts'
import { origenPublico } from '../server/origin.ts'

export const Route = createFileRoute('/opengame-detect.ps1')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        // Imported inside the handler, not at module scope, so the script text stays out of the client chunk.
        const { default: script } = await import('../detector/opengame-detect.ps1?raw')
        const servido = script.replaceAll('__OPENGAME_URL__', origenPublico(request)).replaceAll('__OPENGAME_MAX_JUEGOS__', String(MAX_JUEGOS_BIBLIOTECA))
        return new Response(servido, {
          headers: { 'content-type': 'text/plain; charset=utf-8', 'content-disposition': 'inline; filename="opengame-detect.ps1"' },
        })
      },
    },
  },
})
