import { createFileRoute, Link } from '@tanstack/react-router'
import { guidesFn } from '../../fns/guides.ts'
import { date } from '../../ui/format.ts'
import { DemoStamp } from '../../ui/DemoStamp.tsx'
import { guideType } from '../../ui/vocabulary.ts'

export const Route = createFileRoute('/guias/')({
  loader: () => guidesFn(),
  head: () => ({ meta: [{ title: 'Guías · OpenGame Linux' }] }),
  component: GuidesPage,
})

function GuidesPage() {
  const guides = Route.useLoaderData()
  return (
    <main className="envoltura">
      <h1>Guías de adopción</h1>
      <p className="tenue">Para elegir una distribución, instalarla o convivir con Windows en el mismo equipo.</p>
      {guides.length === 0 ? (
        <p className="tarjeta tenue">Todavía no hay guías publicadas.</p>
      ) : (
        <ul className="lista-tarjetas">
          {guides.map((g) => (
            <li key={g.id} className="tarjeta pila">
              <div className="fila">
                <Link to="/guias/$guideId" params={{ guideId: g.id }} className="nombre-juego">
                  {g.titulo}
                </Link>
                {g.ejemplo && <DemoStamp />}
              </div>
              <div className="fila-chips">
                <span className="chip">{guideType[g.tipo]}</span>
                <span className="chip">{g.distribucion ?? 'cualquier distribución'}</span>
                <span className="pequeno tenue">actualizada el {date(g.actualizado_en)}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
