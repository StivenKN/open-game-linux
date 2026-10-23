import { createServerFn } from '@tanstack/react-start'
import { session } from '../server/queries/follow.ts'
import { runRead } from '../server/run.ts'

export const sessionFn = createServerFn({ method: 'GET' }).handler(() => runRead(session))
