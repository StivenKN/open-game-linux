import { createFileRoute } from '@tanstack/react-router'
import { listarReportesFn } from '#/server/fns'

export const Route = createFileRoute('/')({
  loader: () => listarReportesFn(),
  component: Home,
})

function Home() {
  const reportes = Route.useLoaderData()
  return (
    <main>
      <h1>Reportes</h1>
      <ul>
        {reportes.map((r) => (
          <li key={String(r.id)} data-id-type={typeof r.id}>
            {r.titulo} [{r.estado_revision}]
          </li>
        ))}
      </ul>
    </main>
  )
}
