// Lives under routes/ rather than ui/ because its forms call a server fn, which ui/ may not import.
import { Link, useRouter } from '@tanstack/react-router'
import type { CompatibilityStatus } from '../domain/compatibility.ts'
import { FollowChange, type News } from '../domain/follow.ts'
import type { GameId } from '../domain/ids.ts'
import { changeFollowFn } from '../fns/follow.ts'
import { Badge } from '../ui/Badge.tsx'
import { FieldError } from '../ui/FieldError.tsx'
import { useLang, useT } from '../ui/i18n/messages.ts'
import { useAction } from '../ui/useAction.ts'

// changeFollow has no domain failure; a guest gets the sign-in redirect and anything else the form error.
const useFollowChange = () => {
  const router = useRouter()
  return useAction(FollowChange, changeFollowFn, { onFailure: () => ({}), onComplete: () => router.invalidate() })
}

/** Follow and unfollow on the game page. A guest gets a link to sign in that comes back here. */
export function FollowButton({ gameId, signedIn, following }: { gameId: GameId; signedIn: boolean; following: boolean }) {
  const t = useT()
  const lang = useLang()
  const r = useFollowChange()
  if (!signedIn)
    return (
      <Link to="/$lang/entrar" params={{ lang }} search={{ volver: `/juegos/${gameId}` }} className="button-secondary">
        {t.follow.signIn}
      </Link>
    )
  return (
    <form className="follow-form" {...r.form}>
      <input type="hidden" name="_tag" value={following ? 'Dejar' : 'Seguir'} />
      <input type="hidden" name="game_id" value={gameId} />
      <button type="submit" className="button-secondary" disabled={r.submitting}>
        {following ? t.follow.unfollow : t.follow.follow}
      </button>
      <FieldError errors={r.errors} field="form" />
    </form>
  )
}

/**
 * What changed since the follower last marked the game seen, and the button to mark it seen, on the game page
 * and on the followed games page. `asOf` is the page's watermark: marking seen covers what the follower saw, not more.
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
  const t = useT()
  const m = t.follow.news
  const r = useFollowChange()
  return (
    <section className="follow-news" aria-label={m.label}>
      <div className="stack">
        <p>
          <b>{m.since(t.date(seenAt))}</b>
        </p>
        {news.approved > 0 && <p>{m.approved(news.approved)}</p>}
        {news.previous_status !== null && (
          <p className="row">{m.status(<Badge label={t.compatibilityStatus[news.previous_status]} />, <Badge label={t.compatibilityStatus[status]} />)}</p>
        )}
      </div>
      <form className="row" {...r.form}>
        <input type="hidden" name="_tag" value="Visto" />
        <input type="hidden" name="game_id" value={gameId} />
        <input type="hidden" name="seen_at" value={asOf.toISOString()} />
        <button type="submit" className="button-secondary" disabled={r.submitting}>
          {m.markSeen}
        </button>
        <FieldError errors={r.errors} field="form" />
      </form>
    </section>
  )
}
