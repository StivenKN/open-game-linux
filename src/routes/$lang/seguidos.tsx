import { createFileRoute, Link, redirect } from '@tanstack/react-router'
import { hasNews } from '../../domain/follow.ts'
import { myFollowsFn } from '../../fns/follow.ts'
import { Badge } from '../../ui/Badge.tsx'
import { date } from '../../ui/format.ts'
import { compatibilityStatus } from '../../ui/vocabulary.ts'
import { FollowNews } from '../-follow.tsx'
import { returnHere } from '../-return-to.ts'

export const Route = createFileRoute('/$lang/seguidos')({
  beforeLoad: ({ context, location }) => {
    if (context.visitor === null) throw redirect({ to: '/entrar', search: returnHere(location) })
  },
  loader: () => myFollowsFn(),
  head: () => ({ meta: [{ title: 'Seguidos · OpenGame Linux' }] }),
  component: FollowedPage,
})

function FollowedPage() {
  const { as_of, games } = Route.useLoaderData()
  return (
    <main className="wrapper">
      <h1>Seguidos</h1>
      <p className="muted">Los juegos que sigues y lo que cambió desde la última vez que marcaste cada uno como visto. Solo cuentan los reportes aprobados.</p>
      {games.length === 0 ? (
        <p className="card muted">Todavía no sigues ningún juego. Abre su ficha desde el catálogo y pulsa «Seguir».</p>
      ) : (
        <ul className="card-list">
          {games.map((g) => (
            <li key={g.game_id} className="card stack">
              <div className="row">
                <Link to="/juegos/$gameId" params={{ gameId: g.game_id }} className="game-name">
                  {g.title}
                </Link>
                <Badge label={compatibilityStatus[g.status]} />
              </div>
              {hasNews(g.news) ? (
                <FollowNews gameId={g.game_id} status={g.status} seenAt={g.seen_at} news={g.news} asOf={as_of} />
              ) : (
                <p className="small muted">Sin novedades desde el {date(g.seen_at)}.</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
