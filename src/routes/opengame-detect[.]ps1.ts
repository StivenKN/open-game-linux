import { createFileRoute } from '@tanstack/react-router'
import { origenPublico } from '../servidor/origen.ts'

export const Route = createFileRoute('/opengame-detect.ps1')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        // Imported inside the handler, not at module scope, so the script text stays out of the client chunk.
        const { default: script } = await import('../detector/opengame-detect.ps1?raw')
        return new Response(script.replaceAll('__OPENGAME_URL__', origenPublico(request)), {
          headers: { 'content-type': 'text/plain; charset=utf-8', 'content-disposition': 'inline; filename="opengame-detect.ps1"' },
        })
      },
    },
  },
})
