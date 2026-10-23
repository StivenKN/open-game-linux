import { createFileRoute, Link, redirect } from '@tanstack/react-router'
import { hasNews } from '../../domain/follow.ts'
import { myFollowsFn } from '../../fns/follow.ts'
import { Badge } from '../../ui/Badge.tsx'
import { useLang, useT } from '../../ui/i18n/messages.ts'
import { FollowNews } from '../-follow.tsx'
import { titled } from '../-head.ts'
import { returnHere } from '../-return-to.ts'

export const Route = createFileRoute('/$lang/seguidos')({
  beforeLoad: ({ context, location, params }) => {
    if (context.visitor === null) throw redirect({ to: '/$lang/entrar', params: { lang: params.lang }, search: returnHere(location) })
  },
  loader: () => myFollowsFn(),
  head: ({ params }) => titled(params.lang, (t) => t.follow.page.title),
  component: FollowedPage,
})

function FollowedPage() {
  const { as_of, games } = Route.useLoaderData()
  const t = useT()
  const lang = useLang()
  const m = t.follow.page
  return (
    <main className="wrapper">
      <h1>{m.title}</h1>
      <p className="muted">{m.intro}</p>
      {games.length === 0 ? (
        <p className="card muted">{m.empty}</p>
      ) : (
        <ul className="card-list">
          {games.map((g) => (
            <li key={g.game_id} className="card stack">
              <div className="row">
                <Link to="/$lang/juegos/$gameId" params={{ lang, gameId: g.game_id }} className="game-name">
                  {g.title}
                </Link>
                <Badge label={t.compatibilityStatus[g.status]} />
              </div>
              {hasNews(g.news) ? (
                <FollowNews gameId={g.game_id} status={g.status} seenAt={g.seen_at} news={g.news} asOf={as_of} />
              ) : (
                <p className="small muted">{m.noNews(t.date(g.seen_at))}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
