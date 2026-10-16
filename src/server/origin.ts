// The app's public origin, for text a visitor will paste into a terminal (`curl … | bash`). The request's
// own URL follows its Host header, which a proxy rewrites and a client can forge, so the configured
// BETTER_AUTH_URL (the address better-auth already trusts) wins; the request is only a dev fallback.
const configured = process.env.BETTER_AUTH_URL

export const publicOrigin = (request: Request): string =>
  new URL(configured !== undefined && configured !== '' ? configured : request.url).origin
