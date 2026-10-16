import { createFileRoute } from '@tanstack/react-router'
import { MAX_LIBRARY_GAMES } from '../domain/library.ts'
import { publicOrigin } from '../server/origin.ts'

export const Route = createFileRoute('/opengame-detect.sh')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        // Imported inside the handler, not at module scope, so the script text stays out of the client chunk.
        const { default: script } = await import('../detector/opengame-detect.sh?raw')
        const served = script.replaceAll('__OPENGAME_URL__', publicOrigin(request)).replaceAll('__OPENGAME_MAX_JUEGOS__', String(MAX_LIBRARY_GAMES))
        return new Response(served, {
          headers: { 'content-type': 'text/x-shellscript; charset=utf-8', 'content-disposition': 'inline; filename="opengame-detect.sh"' },
        })
      },
    },
  },
})
