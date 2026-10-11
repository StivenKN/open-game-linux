import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { Effect } from 'effect'
import { auth } from './auth.ts'
import { runtime } from './db.ts'
import { Sesion, quienSoy, sesionDeRequest } from './sesion-programa.ts'

// Keep server-fn files thin: anything at module level here (beyond handler-only imports) ships to the client.
export const quienSoyFn = createServerFn({ method: 'GET' }).handler(async () => {
  const direct = await auth.api.getSession({ headers: getRequest().headers })
  const exit = await runtime.runPromiseExit(
    sesionDeRequest.pipe(Effect.flatMap((s) => quienSoy.pipe(Effect.provideService(Sesion, s)))),
  )
  return { directUser: direct?.user.email ?? null, effect: exit._tag === 'Success' ? exit.value : String(exit.cause) }
})
