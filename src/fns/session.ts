import { createServerFn } from '@tanstack/react-start'
import { Effect, Option } from 'effect'
import { Visitante } from '../server/auth.ts'
import { leer } from '../server/run.ts'

export const visitanteFn = createServerFn({ method: 'GET' }).handler(() => leer(Effect.map(Visitante, Option.getOrNull)))
