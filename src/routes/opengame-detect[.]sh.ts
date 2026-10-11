import { createFileRoute } from '@tanstack/react-router'
import { origenPublico } from '../servidor/origen.ts'

export const Route = createFileRoute('/opengame-detect.sh')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        // Imported inside the handler, not at module scope, so the script text stays out of the client chunk.
        const { default: script } = await import('../detector/opengame-detect.sh?raw')
        return new Response(script.replaceAll('__OPENGAME_URL__', origenPublico(request)), {
          headers: { 'content-type': 'text/x-shellscript; charset=utf-8', 'content-disposition': 'inline; filename="opengame-detect.sh"' },
        })
      },
    },
  },
})
