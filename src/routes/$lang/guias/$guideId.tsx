import { createFileRoute, Link } from '@tanstack/react-router'
import { GuideId } from '../../../domain/ids.ts'
import { canReview } from '../../../domain/review.ts'
import { guideFn } from '../../../fns/guides.ts'
import { Chip } from '../../../ui/Badge.tsx'
import { DemoStamp } from '../../../ui/DemoStamp.tsx'
import { messages, useLang, useT } from '../../../ui/i18n/messages.ts'
import { routeIdParser } from '../../-ids.ts'

const guideId = routeIdParser(GuideId)

export const Route = createFileRoute('/$lang/guias/$guideId')({
  params: { parse: (p) => ({ guideId: guideId(p.guideId) }), stringify: (p) => ({ guideId: String(p.guideId) }) },
  loader: ({ params }) => guideFn({ data: params }),
  head: ({ loaderData, params }) => ({ meta: [{ title: loaderData ? messages[params.lang].title(loaderData.title) : 'OpenGame Linux' }] }),
  component: GuidePage,
})

function GuidePage() {
  const g = Route.useLoaderData()
  const { visitor } = Route.useRouteContext()
  const t = useT()
  const lang = useLang()
  return (
    <main className="wrapper narrow-reading stack">
      <div className="breadcrumbs">
        <Link to="/$lang/guias" params={{ lang }}>
          {t.header.guides}
        </Link>{' '}
        / {t.guideType[g.type]}
      </div>
      <h1>{g.title}</h1>
      <div className="row">
        <span className="chip">{g.distribution ?? t.guides.anyDistribution}</span>
        <span className="small muted">{t.guides.meta(g.revision, t.date(g.updated_at), g.author)}</span>
        {g.status !== 'publicada' && <Chip tone="gris">{t.guides.notPublic(t.guideStatus[g.status])}</Chip>}
        {g.demo && <DemoStamp />}
      </div>
      {visitor !== null && canReview[visitor.role] && (
        <p>
          <Link to="/$lang/guias/$guideId/editar" params={{ lang, guideId: g.id }} className="button-secondary">
            {t.guides.editGuide}
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
