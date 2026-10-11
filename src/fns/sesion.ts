import { createServerFn } from '@tanstack/react-start'
import { Effect, Option } from 'effect'
import { Visitante } from '../servidor/auth.ts'
import { leer } from '../servidor/ejecutar.ts'

export const visitanteFn = createServerFn({ method: 'GET' }).handler(() => leer(Effect.map(Visitante, Option.getOrNull)))
