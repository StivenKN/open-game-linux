// Who is asking, for the root route's context (nav, client-side guards). Same file rule as fns/catalogo.ts.
// UX only: every program re-checks through exigirUsuario / exigirRevisor.
import { createServerFn } from '@tanstack/react-start'
import { Effect, Option } from 'effect'
import { Visitante } from '../servidor/auth.ts'
import { leer } from '../servidor/ejecutar.ts'

export const visitanteFn = createServerFn({ method: 'GET' }).handler(() =>
  leer(Effect.map(Visitante, Option.getOrNull)),
)
