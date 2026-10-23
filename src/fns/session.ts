import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { publicOrigin } from '../server/origin.ts'
import { session } from '../server/queries/follow.ts'
import { runRead } from '../server/run.ts'

// The root's context on every navigation. `origin` is the public address that link previews and embed codes
// are built from.
export const sessionFn = createServerFn({ method: 'GET' }).handler(async () => ({ ...(await runRead(session)), origin: publicOrigin(getRequest()) }))
