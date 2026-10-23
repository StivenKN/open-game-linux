// Lives under routes/ rather than ui/ because its forms call a server fn, which ui/ may not import.
import { Link, useRouter } from '@tanstack/react-router'
import type { CompatibilityStatus } from '../domain/compatibility.ts'
import { FollowChange, type News } from '../domain/follow.ts'
import type { GameId } from '../domain/ids.ts'
import { changeFollowFn } from '../fns/follow.ts'
import { Badge } from '../ui/Badge.tsx'
import { FieldError } from '../ui/FieldError.tsx'
import { count, date } from '../ui/format.ts'
import { useAction } from '../ui/useAction.ts'
import { compatibilityStatus } from '../ui/vocabulary.ts'

// changeFollow has no domain failure; a guest gets the sign-in redirect and anything else the form error.
const useFollowChange = () => {
  const router = useRouter()
  return useAction(FollowChange, changeFollowFn, { onFailure: () => ({}), onComplete: () => router.invalidate() })
}

/** "Seguir" and "Dejar de seguir" on the game page. A guest gets a link to sign in that comes back here. */
export function FollowButton({ gameId, signedIn, following }: { gameId: GameId; signedIn: boolean; following: boolean }) {
  const r = useFollowChange()
  if (!signedIn)
    return (
      <Link to="/entrar" search={{ volver: `/juegos/${gameId}` }} className="button-secondary">
        Entra para seguirlo
      </Link>
    )
  return (
    <form className="follow-form" {...r.form}>
      <input type="hidden" name="_tag" value={following ? 'Dejar' : 'Seguir'} />
      <input type="hidden" name="game_id" value={gameId} />
      <button type="submit" className="button-secondary" disabled={r.submitting}>
        {following ? 'Dejar de seguir' : 'Seguir'}
      </button>
      <FieldError errors={r.errors} field="form" />
    </form>
  )
}

/**
 * What changed since the follower last marked the game seen, and "Marcar como visto", on the game page and
 * on "Seguidos". `asOf` is when the page was computed: marking seen covers what the follower saw, not more.
 */
export function FollowNews({
  gameId,
  status,
  seenAt,
  news,
  asOf,
}: {
  gameId: GameId
  status: CompatibilityStatus
  seenAt: Date
  news: News
  asOf: Date
}) {
  const r = useFollowChange()
  return (
    <section className="follow-news" aria-label="Novedades">
      <div className="stack">
        <p>
          <b>Novedades desde el {date(seenAt)}</b>
        </p>
        {news.approved > 0 && <p>{count(news.approved, 'reporte aprobado nuevo', 'reportes aprobados nuevos')}.</p>}
        {news.previous_status !== null && (
          <p className="row">
            El estado pasó de <Badge label={compatibilityStatus[news.previous_status]} /> a <Badge label={compatibilityStatus[status]} />
          </p>
        )}
      </div>
      <form className="row" {...r.form}>
        <input type="hidden" name="_tag" value="Visto" />
        <input type="hidden" name="game_id" value={gameId} />
        <input type="hidden" name="seen_at" value={asOf.toISOString()} />
        <button type="submit" className="button-secondary" disabled={r.submitting}>
          Marcar como visto
        </button>
        <FieldError errors={r.errors} field="form" />
      </form>
    </section>
  )
}
