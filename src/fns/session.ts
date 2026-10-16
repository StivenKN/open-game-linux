import { createServerFn } from '@tanstack/react-start'
import { Effect, Option } from 'effect'
import { Visitor } from '../server/auth.ts'
import { runRead } from '../server/run.ts'

export const visitorFn = createServerFn({ method: 'GET' }).handler(() => runRead(Effect.map(Visitor, Option.getOrNull)))
