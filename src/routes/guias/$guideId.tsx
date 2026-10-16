import { createFileRoute, Link } from '@tanstack/react-router'
import { GuideId } from '../../domain/ids.ts'
import { guideFn } from '../../fns/guides.ts'
import { date } from '../../ui/format.ts'
import { DemoStamp } from '../../ui/DemoStamp.tsx'
import { guideType } from '../../ui/vocabulary.ts'
import { routeIdParser } from '../-ids.ts'

const guideId = routeIdParser(GuideId)

export const Route = createFileRoute('/guias/$guideId')({
  params: { parse: (p) => ({ guideId: guideId(p.guideId) }), stringify: (p) => ({ guideId: String(p.guideId) }) },
  loader: ({ params }) => guideFn({ data: params }),
  head: ({ loaderData }) => ({ meta: [{ title: loaderData ? `${loaderData.titulo} · OpenGame Linux` : 'OpenGame Linux' }] }),
  component: GuidePage,
})

function GuidePage() {
  const g = Route.useLoaderData()
  return (
    <main className="envoltura estrecha-lectura pila">
      <div className="migas">
        <Link to="/guias">Guías</Link> / {guideType[g.tipo]}
      </div>
      <h1>{g.titulo}</h1>
      <div className="fila">
        <span className="chip">{g.distribucion ?? 'cualquier distribución'}</span>
        <span className="pequeno tenue">
          Revisión {g.revision} · actualizada el {date(g.actualizado_en)} · por {g.autor}
        </span>
        {g.ejemplo && <DemoStamp />}
      </div>
      <article className="tarjeta pila">
        {g.contenido.split(/\n\s*\n/).map((paragraph, i) => (
          <p key={i} className="texto-largo">
            {paragraph}
          </p>
        ))}
      </article>
    </main>
  )
}
