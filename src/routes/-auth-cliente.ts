// better-auth's browser client, apart from -cuenta.ts so the root route (sign-out) does not pull the
// sign-up schemas into the chunk every page loads.
import { createAuthClient } from 'better-auth/react'

export const authCliente = createAuthClient()
