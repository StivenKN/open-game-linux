import { createFileRoute } from '@tanstack/react-router'
import { urlLang } from '../ui/i18n/lang.ts'
import { messages } from '../ui/i18n/messages.ts'

// The social preview of every page that is not a game's, in the language of `?lang=`. It changes only with a deploy.
export const Route = createFileRoute('/og.png')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        // Imported here so satori and the native resvg load only when an image is asked for.
        const { sitePreviewPng } = await import('../images/render.tsx')
        return new Response(await sitePreviewPng(messages[urlLang(new URL(request.url))]), { headers: { 'content-type': 'image/png', 'cache-control': 'public, max-age=86400' } })
      },
    },
  },
})
