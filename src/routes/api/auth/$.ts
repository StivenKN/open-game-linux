// The one route file allowed to import servidor/ (fronteras.test.ts allowlist): server handlers only.
import { createFileRoute } from '@tanstack/react-router'
import { auth } from '../../../servidor/auth.ts'

export const Route = createFileRoute('/api/auth/$')({
  server: { handlers: { GET: ({ request }) => auth.handler(request), POST: ({ request }) => auth.handler(request) } },
})
