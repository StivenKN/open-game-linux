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
    <main className="wrapper">
      <h1>Guías de adopción</h1>
      <p className="muted">Para elegir una distribución, instalarla o convivir con Windows en el mismo equipo.</p>
      {guides.length === 0 ? (
        <p className="card muted">Todavía no hay guías publicadas.</p>
      ) : (
        <ul className="card-list">
          {guides.map((g) => (
            <li key={g.id} className="card stack">
              <div className="row">
                <Link to="/guias/$guideId" params={{ guideId: g.id }} className="game-name">
                  {g.title}
                </Link>
                {g.demo && <DemoStamp />}
              </div>
              <div className="chip-row">
                <span className="chip">{guideType[g.type]}</span>
                <span className="chip">{g.distribution ?? 'cualquier distribución'}</span>
                <span className="small muted">actualizada el {date(g.updated_at)}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
