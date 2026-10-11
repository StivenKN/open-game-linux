// Sign-in / sign-up through better-auth's client (`better-auth/react`). Not an Effect concern.
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/entrar')({ component: () => <form>{/* authClient.signIn.email(...) */}</form> })
