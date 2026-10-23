import { createFileRoute, Link } from '@tanstack/react-router'
import { canReview } from '../../../domain/review.ts'
import { guidesFn } from '../../../fns/guides.ts'
import { Chip } from '../../../ui/Badge.tsx'
import { DemoStamp } from '../../../ui/DemoStamp.tsx'
import { useLang, useT } from '../../../ui/i18n/messages.ts'
import { titled } from '../../-head.ts'

export const Route = createFileRoute('/$lang/guias/')({
  loader: () => guidesFn(),
  head: ({ params }) => titled(params.lang, (t) => t.header.guides),
  component: GuidesPage,
})

function GuidesPage() {
  const guides = Route.useLoaderData()
  const { visitor } = Route.useRouteContext()
  const t = useT()
  const lang = useLang()
  return (
    <main className="wrapper">
      <h1>{t.guides.heading}</h1>
      <p className="muted">{t.guides.lede}</p>
      {visitor !== null && canReview[visitor.role] && (
        <p>
          <Link to="/$lang/guias/nueva" params={{ lang }} className="button">
            {t.guides.newGuide}
          </Link>
        </p>
      )}
      {guides.length === 0 ? (
        <p className="card muted">{t.guides.none}</p>
      ) : (
        <ul className="card-list">
          {guides.map((g) => (
            <li key={g.id} className="card stack">
              <div className="row">
                <Link to="/$lang/guias/$guideId" params={{ lang, guideId: g.id }} className="game-name">
                  {g.title}
                </Link>
                {g.status !== 'publicada' && <Chip tone="gris">{t.guideStatus[g.status]}</Chip>}
                {g.demo && <DemoStamp />}
              </div>
              <div className="chip-row">
                <span className="chip">{t.guideType[g.type]}</span>
                <span className="chip">{g.distribution ?? t.guides.anyDistribution}</span>
                <span className="small muted">{t.guides.updatedOn(t.date(g.updated_at))}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
