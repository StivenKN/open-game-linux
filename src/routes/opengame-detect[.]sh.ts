// Serves the detector with this deployment's origin baked in, so `--open` lands on the right host:
//   curl -fsSL <origen>/opengame-detect.sh | bash -s -- --open
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/opengame-detect.sh')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        // Imported inside the handler, not at module scope, so the script text stays out of the client chunk.
        const { default: script } = await import('../detector/opengame-detect.sh?raw')
        return new Response(script.replaceAll('__OPENGAME_URL__', new URL(request.url).origin), {
          headers: { 'content-type': 'text/x-shellscript; charset=utf-8', 'content-disposition': 'inline; filename="opengame-detect.sh"' },
        })
      },
    },
  },
})
