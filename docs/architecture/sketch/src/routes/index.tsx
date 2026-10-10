// Catalog + search (wireframe 9.1). Filters live in the URL, validated by the same Schema the server fn uses.
import { Link, createFileRoute } from '@tanstack/react-router'
import { Schema } from 'effect'
import { FiltroCatalogo } from '../dominio/aportes.ts'
import { catalogoFn } from '../fns/catalogo.ts'
import { estadoCompatibilidad } from '../ui/vocabulario.ts'

export const Route = createFileRoute('/')({
  validateSearch: Schema.toStandardSchemaV1(FiltroCatalogo),
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => catalogoFn({ data: deps }),
  component: Catalogo,
})

function Catalogo() {
  const { juegos } = Route.useLoaderData()
  return (
    <ul>
      {juegos.map((j) => (
        <li key={j.id}>
          <Link to="/juegos/$juegoId" params={{ juegoId: String(j.id) }}>{j.titulo}</Link> {estadoCompatibilidad[j.estado].texto} · {j.pruebas} aprobados
        </li>
      ))}
    </ul>
  )
}
