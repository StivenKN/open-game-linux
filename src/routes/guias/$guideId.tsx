import { createFileRoute, Link } from '@tanstack/react-router'
import { GuideId } from '../../domain/ids.ts'
import { canReview } from '../../domain/review.ts'
import { guideFn } from '../../fns/guides.ts'
import { Chip } from '../../ui/Badge.tsx'
import { date } from '../../ui/format.ts'
import { DemoStamp } from '../../ui/DemoStamp.tsx'
import { guideStatus, guideType } from '../../ui/vocabulary.ts'
import { routeIdParser } from '../-ids.ts'

const guideId = routeIdParser(GuideId)

export const Route = createFileRoute('/guias/$guideId')({
  params: { parse: (p) => ({ guideId: guideId(p.guideId) }), stringify: (p) => ({ guideId: String(p.guideId) }) },
  loader: ({ params }) => guideFn({ data: params }),
  head: ({ loaderData }) => ({ meta: [{ title: loaderData ? `${loaderData.title} · OpenGame Linux` : 'OpenGame Linux' }] }),
  component: GuidePage,
})

function GuidePage() {
  const g = Route.useLoaderData()
  const { visitor } = Route.useRouteContext()
  return (
    <main className="wrapper narrow-reading stack">
      <div className="breadcrumbs">
        <Link to="/guias">Guías</Link> / {guideType[g.type]}
      </div>
      <h1>{g.title}</h1>
      <div className="row">
        <span className="chip">{g.distribution ?? 'cualquier distribución'}</span>
        <span className="small muted">
          Revisión {g.revision} · actualizada el {date(g.updated_at)} · por {g.author}
        </span>
        {g.status !== 'publicada' && <Chip tone="gris">{guideStatus[g.status]}: no es pública</Chip>}
        {g.demo && <DemoStamp />}
      </div>
      {visitor !== null && canReview[visitor.role] && (
        <p>
          <Link to="/guias/$guideId/editar" params={{ guideId: g.id }} className="button-secondary">
            Editar la guía
          </Link>
        </p>
      )}
      <article className="card stack">
        {g.content.split(/\n\s*\n/).map((paragraph, i) => (
          <p key={i} className="long-text">
            {paragraph}
          </p>
        ))}
      </article>
    </main>
  )
}
