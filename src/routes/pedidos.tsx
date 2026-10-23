import { createFileRoute, Link, useLocation, useRouter } from '@tanstack/react-router'
import { Schema } from 'effect'
import { useState } from 'react'
import { RejectRequest, RequestGame } from '../domain/contributions.ts'
import { GameRequestId } from '../domain/ids.ts'
import { canReview } from '../domain/review.ts'
import { gameRequestsFn, rejectRequestFn, requestGameFn, withdrawRequestFn } from '../fns/game-requests.ts'
import { Badge } from '../ui/Badge.tsx'
import { DemoStamp } from '../ui/DemoStamp.tsx'
import { FieldError } from '../ui/FieldError.tsx'
import { Field, fieldProps } from '../ui/form.tsx'
import { count, date } from '../ui/format.ts'
import { ruleErrors, useAction } from '../ui/useAction.ts'
import { gameRequestStatus } from '../ui/vocabulary.ts'
import { lenient, SearchText } from './-search.ts'
import { returnHere } from './-return-to.ts'

export const Route = createFileRoute('/pedidos')({
  // `?titulo=` prefills the form: the catalog's "¿No está? Pídelo" passes the search that found nothing.
  validateSearch: Schema.toStandardSchemaV1(Schema.Struct({ titulo: lenient(Schema.optionalKey(SearchText)) })),
  loader: () => gameRequestsFn(),
  head: () => ({ meta: [{ title: 'Pedidos de juegos · OpenGame Linux' }] }),
  component: GameRequestsPage,
})

type Requests = Awaited<ReturnType<typeof gameRequestsFn>>
type Outcome = Extract<Awaited<ReturnType<typeof requestGameFn>>, { ok: true }>['value']

const requesters = (n: number) => count(n, 'persona lo pide', 'personas lo piden')

function GameRequestsPage() {
  const { open, mine } = Route.useLoaderData()
  const { titulo } = Route.useSearch()
  const { visitor } = Route.useRouteContext()
  const location = useLocation()
  return (
    <main className="wrapper">
      <h1>Pedidos de juegos</h1>
      <p className="muted">
        ¿Falta un juego en el catálogo? Pídelo. Si alguien ya lo pidió, te sumas a su pedido. Un revisor lo agrega con sus datos, y aquí ves
        cuándo está listo.
      </p>
      {visitor === null ? (
        <p className="card">
          <Link to="/entrar" search={returnHere(location)}>
            Entra
          </Link>{' '}
          para pedir un juego o sumarte a un pedido.
        </p>
      ) : (
        <RequestForm title={titulo} />
      )}

      {mine.length > 0 && (
        <section aria-labelledby="mine-title">
          <h2 id="mine-title" className="section-title">
            Tus pedidos
          </h2>
          <ul className="card-list">
            {mine.map((r) => (
              <MyRequest key={r.id} request={r} />
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="open-title">
        <h2 id="open-title" className="section-title">
          Pedidos abiertos
        </h2>
        {open.length === 0 ? (
          <p className="card muted">No hay pedidos abiertos.</p>
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
        Pedir un juego
      </h2>
      <FieldError errors={r.errors} field="form" />
      <input type="hidden" name="_tag" value="nuevo" />
      <Field errors={r.errors} name="title" label="Título">
        <input {...fieldProps(r.errors, 'title')} defaultValue={title ?? ''} key={title} />
      </Field>
      <Field
        errors={r.errors}
        name="steam_app_id"
        label="Enlace o App ID de Steam (opcional)"
        help="Con él, nadie pide el mismo juego dos veces y el revisor rellena la ficha desde la tienda."
      >
        <input {...fieldProps(r.errors, 'steam_app_id')} placeholder="https://store.steampowered.com/app/…" />
      </Field>
      <button type="submit" disabled={r.submitting}>
        Pedirlo
      </button>
      {outcome !== null && <OutcomeNote outcome={outcome} />}
    </form>
  )
}

function OutcomeNote({ outcome }: { outcome: Outcome }) {
  if (outcome._tag === 'en_catalogo')
    return (
      <p className="note small" data-tone="verde" role="status">
        «{outcome.game.title}» ya está en el catálogo.{' '}
        <Link to="/juegos/$gameId" params={{ gameId: outcome.game.id }}>
          Ver su ficha
        </Link>
      </p>
    )
  return (
    <p className="note small" data-tone="verde" role="status">
      {outcome.requesters === 1
        ? `Pediste «${outcome.request.title}». Cuando un revisor lo agregue, lo verás en «Tus pedidos».`
        : `Te sumaste al pedido de «${outcome.request.title}». Ya lo piden ${outcome.requesters} personas.`}
    </p>
  )
}

function MyRequest({ request: r }: { request: Requests['mine'][number] }) {
  return (
    <li className="card stack">
      <div className="row">
        <Badge label={gameRequestStatus[r.status]} />
        <strong>{r.title}</strong>
      </div>
      {r.status === 'abierto' && (
        <div className="row">
          <span className="small muted">{requesters(r.requesters)}</span>
          <WithdrawButton id={r.id} />
        </div>
      )}
      {r.status === 'cumplido' && (
        <p className="small no-margin">
          Un revisor lo agregó el {date(r.resolved_at)}.{' '}
          <Link to="/juegos/$gameId" params={{ gameId: r.game_id }}>
            Ver la ficha de {r.game}
          </Link>
        </p>
      )}
      {r.status === 'rechazado' && (
        <p className="small no-margin">
          Un revisor lo rechazó el {date(r.resolved_at)}: {r.rejection_reason}
        </p>
      )}
    </li>
  )
}

function OpenRequest({ request: r, signedIn, reviewer }: { request: Requests['open'][number]; signedIn: boolean; reviewer: boolean }) {
  return (
    <li className="card stack">
      <div className="row">
        <strong className="game-name">{r.title}</strong>
        {r.steam_app_id !== null && (
          <a href={`https://store.steampowered.com/app/${r.steam_app_id}`} target="_blank" rel="noreferrer" className="small">
            Ver en Steam
          </a>
        )}
        {r.demo && <DemoStamp />}
      </div>
      <div className="row">
        <span className="small muted">
          {requesters(r.requesters)} · desde el {date(r.created_at)}
        </span>
        {signedIn && (r.mine ? <span className="small">Ya lo pides</span> : <JoinButton id={r.id} />)}
      </div>
      {reviewer && <ReviewerActions id={r.id} />}
    </li>
  )
}

const RequestRef = Schema.Struct({ id: GameRequestId })

function JoinButton({ id }: { id: GameRequestId }) {
  const router = useRouter()
  const r = useAction(RequestGame, requestGameFn, { onFailure: ruleErrors, onComplete: () => router.invalidate() })
  return (
    <form {...r.form}>
      <input type="hidden" name="_tag" value="existente" />
      <input type="hidden" name="id" value={id} />
      <button type="submit" className="button-secondary" disabled={r.submitting}>
        Sumarme
      </button>
      <FieldError errors={r.errors} field="form" />
    </form>
  )
}

function WithdrawButton({ id }: { id: GameRequestId }) {
  const router = useRouter()
  const r = useAction(RequestRef, withdrawRequestFn, { onFailure: ruleErrors, onComplete: () => router.invalidate() })
  return (
    <form {...r.form}>
      <input type="hidden" name="id" value={id} />
      <button type="submit" className="button-secondary" disabled={r.submitting}>
        Ya no lo pido
      </button>
      <FieldError errors={r.errors} field="form" />
    </form>
  )
}

function ReviewerActions({ id }: { id: GameRequestId }) {
  const router = useRouter()
  const r = useAction(RejectRequest, rejectRequestFn, { onFailure: ruleErrors, onComplete: () => router.invalidate() })
  return (
    <form className="form decision" {...r.form}>
      <FieldError errors={r.errors} field="form" />
      <input type="hidden" name="id" value={id} />
      <label>
        Motivo (para rechazar)
        <textarea name="reason" rows={2} aria-invalid={r.errors.reason !== undefined} />
      </label>
      <FieldError errors={r.errors} field="reason" />
      <div className="row">
        <Link to="/catalogo/nuevo" search={{ pedido: id }} className="button">
          Crear el juego
        </Link>
        <button type="submit" className="button-secondary" disabled={r.submitting}>
          Rechazar
        </button>
      </div>
    </form>
  )
}
