import { createFileRoute } from '@tanstack/react-router'
import { quienSoyFn } from '#/server/session'

export const Route = createFileRoute('/yo')({
  loader: () => quienSoyFn(),
  component: () => <pre id="yo">{JSON.stringify(Route.useLoaderData())}</pre>,
})
