import { createCsrfMiddleware, createMiddleware, createStart } from '@tanstack/react-start'
import { unprefixedRedirect } from './ui/i18n/lang.ts'

// A page path without a language (an old link, a bookmark, the detector's /diagnostico/importar#d=…) gets
// the same path and query in the visitor's language. The browser keeps the fragment across the redirect.
const localize = createMiddleware({ type: 'request' }).server(({ request, handlerType, next }) => {
  const location = handlerType === 'router' && (request.method === 'GET' || request.method === 'HEAD') ? unprefixedRedirect(new URL(request.url), request.headers) : null
  return location === null ? next() : new Response(null, { status: 302, headers: { location, vary: 'Cookie, Accept-Language' } })
})

export const startInstance = createStart(() => ({
  requestMiddleware: [localize, createCsrfMiddleware({ filter: (ctx) => ctx.handlerType === 'serverFn' })],
}))
