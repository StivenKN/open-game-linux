import { createFileRoute, Link, useLocation, useRouter } from '@tanstack/react-router'
import { Schema } from 'effect'
import { useState } from 'react'
import { RejectRequest, RequestGame } from '../../domain/contributions.ts'
import { GameRequestId } from '../../domain/ids.ts'
import { canReview } from '../../domain/review.ts'
import { gameRequestsFn, rejectRequestFn, requestGameFn, withdrawRequestFn } from '../../fns/game-requests.ts'
import { DemoStamp } from '../../ui/DemoStamp.tsx'
import { FieldError } from '../../ui/FieldError.tsx'
import { Field, fieldProps } from '../../ui/form.tsx'
import { useLang, useT } from '../../ui/i18n/messages.ts'
import { ruleErrors, useAction } from '../../ui/useAction.ts'
import { titled } from '../-head.ts'
import { lenient, SearchText } from '../-search.ts'
import { returnHere } from '../-return-to.ts'

export const Route = createFileRoute('/$lang/pedidos')({
  // `?titulo=` prefills the form: the catalog's request links pass the search.
  validateSearch: Schema.toStandardSchemaV1(Schema.Struct({ titulo: lenient(Schema.optionalKey(SearchText)) })),
  loader: () => gameRequestsFn(),
  head: ({ params }) => titled(params.lang, (t) => t.requests.title),
  component: GameRequestsPage,
})

type OpenRequestRow = Awaited<ReturnType<typeof gameRequestsFn>>[number]
type Outcome = Extract<Awaited<ReturnType<typeof requestGameFn>>, { ok: true }>['value']

function GameRequestsPage() {
  const open = Route.useLoaderData()
  const { titulo } = Route.useSearch()
  const { visitor } = Route.useRouteContext()
  const location = useLocation()
  const t = useT()
  const lang = useLang()
  return (
    <main className="wrapper">
      <h1>{t.requests.title}</h1>
      <p className="muted">
        {t.requests.lede((text) => (
          <Link to="/$lang/mis-aportes" params={{ lang }} hash="pedidos">
            {text}
          </Link>
        ))}
      </p>
      {visitor === null ? (
        <p className="card">
          {t.requests.signIn((text) => (
            <Link to="/$lang/entrar" params={{ lang }} search={returnHere(location)}>
              {text}
            </Link>
          ))}
        </p>
      ) : (
        <RequestForm title={titulo} />
      )}

      <section aria-labelledby="open-title">
        <h2 id="open-title" className="section-title">
          {t.requests.open}
        </h2>
        {open.length === 0 ? (
          <p className="card muted">{t.requests.none}</p>
        ) : (
          <ul className="card-list">
            {open.map((r) => (
              <OpenRequest key={r.id} request={r} signedIn={visitor !== null} reviewer={visitor !== null && canReview[visitor.role]} />
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}

function RequestForm({ title }: { title: string | undefined }) {
  const router = useRouter()
  const f = useT().requests.form
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const r = useAction(RequestGame, requestGameFn, {
    onFailure: ruleErrors,
    onComplete: async (o) => {
      setOutcome(o)
      await router.invalidate()
    },
  })
  return (
    <form className="card form form-wide" aria-labelledby="request-title" {...r.form}>
      <h2 id="request-title" className="no-margin">
        {f.heading}
      </h2>
      <FieldError errors={r.errors} field="form" />
      <input type="hidden" name="_tag" value="nuevo" />
      <Field errors={r.errors} name="title" label={f.title}>
        <input {...fieldProps(r.errors, 'title')} defaultValue={title ?? ''} key={title} />
      </Field>
      <Field errors={r.errors} name="steam_app_id" label={f.steam} help={f.steamHelp}>
        <input {...fieldProps(r.errors, 'steam_app_id')} placeholder="https://store.steampowered.com/app/…" />
      </Field>
      <button type="submit" disabled={r.submitting}>
        {f.submit}
      </button>
      {outcome !== null && <OutcomeNote outcome={outcome} />}
    </form>
  )
}

function OutcomeNote({ outcome }: { outcome: Outcome }) {
  const t = useT()
  const lang = useLang()
  if (outcome._tag === 'en_catalogo')
    return (
      <p className="note small" data-tone="verde" role="status">
        {t.requests.inCatalog(outcome.game.title)}{' '}
        <Link to="/$lang/juegos/$gameId" params={{ lang, gameId: outcome.game.id }}>
          {t.requests.viewGame}
        </Link>
      </p>
    )
  return (
    <p className="note small" data-tone="verde" role="status">
      {outcome.requesters === 1 ? t.requests.requested(outcome.request.title) : t.requests.joined(outcome.request.title, outcome.requesters)}
    </p>
  )
}

// The `pedido-<id>` anchor is where Mis aportes links an open request.
function OpenRequest({ request: r, signedIn, reviewer }: { request: OpenRequestRow; signedIn: boolean; reviewer: boolean }) {
  const t = useT()
  return (
    <li id={`pedido-${r.id}`} className="card stack">
      <div className="row">
        <strong className="game-name">{r.title}</strong>
        {r.steam_app_id !== null && (
          <a href={`https://store.steampowered.com/app/${r.steam_app_id}`} target="_blank" rel="noreferrer" className="small">
            {t.requests.viewOnSteam}
          </a>
        )}
        {r.demo && <DemoStamp />}
      </div>
      <div className="row">
        <span className="small muted">
          {t.requests.requesters(r.requesters)} · {t.requests.since(t.date(r.created_at))}
        </span>
        {signedIn && (r.mine ? <WithdrawButton id={r.id} /> : <JoinButton id={r.id} />)}
      </div>
      {reviewer && <ReviewerActions id={r.id} />}
    </li>
  )
}

const RequestRef = Schema.Struct({ id: GameRequestId })

function JoinButton({ id }: { id: GameRequestId }) {
  const router = useRouter()
  const t = useT()
  const r = useAction(RequestGame, requestGameFn, { onFailure: ruleErrors, onComplete: () => router.invalidate() })
  return (
    <form {...r.form}>
      <input type="hidden" name="_tag" value="existente" />
      <input type="hidden" name="id" value={id} />
      <button type="submit" className="button-secondary" disabled={r.submitting}>
        {t.requests.join}
      </button>
      <FieldError errors={r.errors} field="form" />
    </form>
  )
}

function WithdrawButton({ id }: { id: GameRequestId }) {
  const router = useRouter()
  const t = useT()
  const r = useAction(RequestRef, withdrawRequestFn, { onFailure: ruleErrors, onComplete: () => router.invalidate() })
  return (
    <form {...r.form}>
      <input type="hidden" name="id" value={id} />
      <button type="submit" className="button-secondary" disabled={r.submitting}>
        {t.requests.withdraw}
      </button>
      <FieldError errors={r.errors} field="form" />
    </form>
  )
}

function ReviewerActions({ id }: { id: GameRequestId }) {
  const router = useRouter()
  const t = useT()
  const lang = useLang()
  const r = useAction(RejectRequest, rejectRequestFn, { onFailure: ruleErrors, onComplete: () => router.invalidate() })
  return (
    <form className="form decision" {...r.form}>
      <FieldError errors={r.errors} field="form" />
      <input type="hidden" name="id" value={id} />
      <label>
        {t.requests.rejectReason}
        <textarea name="reason" rows={2} aria-invalid={r.errors.reason !== undefined} />
      </label>
      <FieldError errors={r.errors} field="reason" />
      <div className="row">
        <Link to="/$lang/catalogo/nuevo" params={{ lang }} search={{ pedido: id }} className="button">
          {t.requests.createGame}
        </Link>
        <button type="submit" className="button-secondary" disabled={r.submitting}>
          {t.requests.reject}
        </button>
      </div>
    </form>
  )
}
