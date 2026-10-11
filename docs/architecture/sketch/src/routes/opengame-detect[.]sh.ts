// Serves the detector with this deployment's origin baked in, so `--open` lands on the right host:
//   curl -fsSL https://<host>/opengame-detect.sh -o opengame-detect.sh && bash opengame-detect.sh --open
import { createFileRoute } from '@tanstack/react-router'
import script from '../detector/opengame-detect.sh?raw'

export const Route = createFileRoute('/opengame-detect.sh')({
  server: {
    handlers: {
      GET: ({ request }) =>
        new Response(script.replaceAll('__OPENGAME_URL__', new URL(request.url).origin), {
          headers: { 'content-type': 'text/x-shellscript; charset=utf-8', 'content-disposition': 'attachment; filename="opengame-detect.sh"' },
        }),
    },
  },
})
