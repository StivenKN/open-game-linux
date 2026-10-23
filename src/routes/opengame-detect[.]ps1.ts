import { createFileRoute } from '@tanstack/react-router'
import { MAX_LIBRARY_GAMES } from '../domain/library.ts'
import { publicOrigin } from '../server/origin.ts'
import { urlLang } from '../ui/i18n/lang.ts'

export const Route = createFileRoute('/opengame-detect.ps1')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        // Imported inside the handler, not at module scope, so the script text stays out of the client chunk.
        const { default: script } = await import('../detector/opengame-detect.ps1?raw')
        // `?lang=en` from an English page: the script speaks English and opens the English pages.
        const served = script
          .replaceAll('__OPENGAME_URL__', publicOrigin(request))
          .replaceAll('__OPENGAME_MAX_JUEGOS__', String(MAX_LIBRARY_GAMES))
          .replaceAll('__OPENGAME_LANG__', urlLang(new URL(request.url)))
        return new Response(served, {
          headers: { 'content-type': 'text/plain; charset=utf-8', 'content-disposition': 'inline; filename="opengame-detect.ps1"' },
        })
      },
    },
  },
})
