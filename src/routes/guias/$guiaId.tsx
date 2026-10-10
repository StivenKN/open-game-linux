// One published guide. Its content is plain text written by the seed; blank lines separate paragraphs.
import { createFileRoute, Link } from '@tanstack/react-router'
import { GuiaId } from '../../dominio/ids.ts'
import { guiaFn } from '../../fns/guias.ts'
import { fecha } from '../../ui/formato.ts'
import { SelloEjemplo } from '../../ui/SelloEjemplo.tsx'
import { tipoGuia } from '../../ui/vocabulario.ts'
import { idDeRuta } from '../-ids.ts'

const guiaId = idDeRuta(GuiaId)

export const Route = createFileRoute('/guias/$guiaId')({
  params: { parse: (p) => ({ guiaId: guiaId(p.guiaId) }), stringify: (p) => ({ guiaId: String(p.guiaId) }) },
  loader: ({ params }) => guiaFn({ data: params }),
  head: ({ loaderData }) => ({ meta: [{ title: loaderData ? `${loaderData.titulo} · OpenGame Linux` : 'OpenGame Linux' }] }),
  component: Guia,
})

function Guia() {
  const g = Route.useLoaderData()
  return (
    <main className="envoltura estrecha-lectura pila">
      <div className="migas">
        <Link to="/guias">Guías</Link> / {tipoGuia[g.tipo]}
      </div>
      <h1>{g.titulo}</h1>
      <div className="fila">
        <span className="chip">{g.distribucion ?? 'cualquier distribución'}</span>
        <span className="pequeno tenue">
          Revisión {g.revision} · actualizada el {fecha(g.actualizado_en)} · por {g.autor}
        </span>
        {g.ejemplo && <SelloEjemplo />}
      </div>
      <article className="tarjeta pila">
        {g.contenido.split(/\n\s*\n/).map((parrafo, i) => (
          <p key={i} className="texto-largo">
            {parrafo}
          </p>
        ))}
      </article>
    </main>
  )
}
