import { createFileRoute } from '@tanstack/react-router'
import { auth } from '../../../servidor/auth.ts'

// The one route file allowed to import servidor/ (fronteras.test.ts allowlist): server handlers only.
export const Route = createFileRoute('/api/auth/$')({
  server: { handlers: { GET: ({ request }) => auth.handler(request), POST: ({ request }) => auth.handler(request) } },
})
