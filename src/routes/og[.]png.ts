import { createFileRoute } from '@tanstack/react-router'

// The social preview of every page that is not a game's. It changes only with a deploy.
export const Route = createFileRoute('/og.png')({
  server: {
    handlers: {
      GET: async () => {
        // Imported here so satori and the native resvg load only when an image is asked for.
        const { sitePreviewPng } = await import('../images/render.tsx')
        return new Response(await sitePreviewPng(), { headers: { 'content-type': 'image/png', 'cache-control': 'public, max-age=86400' } })
      },
    },
  },
})
