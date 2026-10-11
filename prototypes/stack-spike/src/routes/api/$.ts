import { createFileRoute } from '@tanstack/react-router'
import { apiHandler } from '#/api/server'

export const Route = createFileRoute('/api/$')({
  server: {
    handlers: {
      GET: ({ request }) => apiHandler(request),
      POST: ({ request }) => apiHandler(request),
    },
  },
})
