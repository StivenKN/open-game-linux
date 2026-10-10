// Server fns are same-origin RPC; every write goes through one (servidor/ejecutar.ts accion), and the
// session cookie rides along. This refuses a server fn call that a different origin started.
import { createCsrfMiddleware, createStart } from '@tanstack/react-start'

export const startInstance = createStart(() => ({
  requestMiddleware: [createCsrfMiddleware({ filter: (ctx) => ctx.handlerType === 'serverFn' })],
}))
