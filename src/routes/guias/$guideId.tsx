import { createFileRoute, Link } from '@tanstack/react-router'
import { GuideId } from '../../domain/ids.ts'
import { guideFn } from '../../fns/guides.ts'
import { fecha } from '../../ui/format.ts'
import { SelloEjemplo } from '../../ui/DemoStamp.tsx'
import { tipoGuia } from '../../ui/vocabulary.ts'
import { idDeRuta } from '../-ids.ts'

const guideId = idDeRuta(GuideId)

export const Route = createFileRoute('/guias/$guideId')({
  params: { parse: (p) => ({ guideId: guideId(p.guideId) }), stringify: (p) => ({ guideId: String(p.guideId) }) },
  loader: ({ params }) => guideFn({ data: params }),
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
