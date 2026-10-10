import { createFileRoute } from '@tanstack/react-router'
import { guiasFn } from '../../fns/catalogo.ts'

export const Route = createFileRoute('/guias/')({
  loader: () => guiasFn(),
  component: () => <ul>{Route.useLoaderData().map((g) => <li key={g.id}>{g.titulo}</li>)}</ul>,
})
