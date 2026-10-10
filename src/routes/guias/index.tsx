// Adoption guides (RF-09): choosing a distribution, installing it, dual boot. Published guides only.
import { createFileRoute, Link } from '@tanstack/react-router'
import { guiasFn } from '../../fns/guias.ts'
import { fecha } from '../../ui/formato.ts'
import { SelloEjemplo } from '../../ui/SelloEjemplo.tsx'
import { tipoGuia } from '../../ui/vocabulario.ts'

export const Route = createFileRoute('/guias/')({
  loader: () => guiasFn(),
  head: () => ({ meta: [{ title: 'Guías · OpenGame Linux' }] }),
  component: Guias,
})

function Guias() {
  const guias = Route.useLoaderData()
  return (
    <main className="envoltura">
      <h1>Guías de adopción</h1>
      <p className="tenue">Para elegir una distribución, instalarla o convivir con Windows en el mismo equipo.</p>
      {guias.length === 0 ? (
        <p className="tarjeta tenue">Todavía no hay guías publicadas.</p>
      ) : (
        <ul className="lista-tarjetas">
          {guias.map((g) => (
            <li key={g.id} className="tarjeta pila">
              <div className="fila">
                <Link to="/guias/$guiaId" params={{ guiaId: g.id }} className="nombre-juego">
                  {g.titulo}
                </Link>
                {g.ejemplo && <SelloEjemplo />}
              </div>
              <div className="fila-chips">
                <span className="chip">{tipoGuia[g.tipo]}</span>
                <span className="chip">{g.distribucion ?? 'cualquier distribución'}</span>
                <span className="pequeno tenue">actualizada el {fecha(g.actualizado_en)}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
