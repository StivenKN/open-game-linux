import { createFileRoute, Link, notFound, redirect, useRouter } from '@tanstack/react-router'
import { Schema } from 'effect'
import type { ReactNode } from 'react'
import type { ApprovalBlocked, Encoded, RuleViolated, InvalidTransition } from '../../domain/errors.ts'
import { ContributionRef, Decision, ContributionType } from '../../domain/review.ts'
import { queueFn, decideFn } from '../../fns/review.ts'
import { Chip, Badge } from '../../ui/Badge.tsx'
import { FieldError } from '../../ui/FieldError.tsx'
import { useLang, useT } from '../../ui/i18n/messages.ts'
import { ruleErrors, type FieldErrors, useAction } from '../../ui/useAction.ts'
import { titled } from '../-head.ts'
import { returnHere } from '../-return-to.ts'

export const Route = createFileRoute('/$lang/revision')({
  validateSearch: Schema.toStandardSchemaV1(Schema.Struct({ tipo: Schema.optionalKey(ContributionType) })),
  beforeLoad: ({ context, location, params }) => {
    if (context.visitor === null) throw redirect({ to: '/$lang/entrar', params: { lang: params.lang }, search: returnHere(location) })
    if (context.visitor.role === 'usuario') throw notFound()
  },
  loaderDeps: ({ search }) => ({ tipo: search.tipo ?? 'reporte' }),
  loader: ({ deps }) => queueFn({ data: deps }),
  head: ({ params }) => titled(params.lang, (t) => t.header.review),
  component: ReviewPage,
})

type ReviewQueue = Awaited<ReturnType<typeof queueFn>>
type ItemOf<T extends ReviewQueue['type']> = Extract<ReviewQueue, { type: T }>['items'][number]

function ReviewPage() {
  const queue = Route.useLoaderData()
  const t = useT()
  const lang = useLang()
  const q = t.review.queue
  const pendingCount = queue.items.filter((e) => e.review_status === 'pendiente').length
  return (
    <main className="wrapper">
      <h1>{q.heading}</h1>
      <p className="muted">{q.lede}</p>
      <nav aria-label={q.tabsLabel} className="row tabs">
        {ContributionType.literals.map((type) => (
          <Link
            key={type}
            to="/$lang/revision"
            params={{ lang }}
            search={{ tipo: type }}
            aria-current={type === queue.type ? 'page' : undefined}
            className={type === queue.type ? 'button' : 'button-secondary'}
          >
            {q.tabs[type]}
          </Link>
        ))}
      </nav>
      <p className="small muted">{q.pending(pendingCount)}</p>
      {queue.items.length === 0 && <p className="card">{q.empty(queue.type)}</p>}
      {/* Keyed by state too, so a decided row remounts with an empty form instead of keeping the old reason. */}
      <div className="stack">
        {queue.type === 'reporte' &&
          queue.items.map((e) => (
            <ReviewItem key={`${e.id}-${e.review_status}`} contributionRef={{ _tag: 'reporte', id: e.id }} item={e}>
              <ReportDetail e={e} />
            </ReviewItem>
          ))}
        {queue.type === 'perfil' &&
          queue.items.map((e) => (
            <ReviewItem key={`${e.id}-${e.review_status}`} contributionRef={{ _tag: 'perfil', id: e.id }} item={e}>
              <ProfileDetail e={e} />
            </ReviewItem>
          ))}
        {queue.type === 'solucion' &&
          queue.items.map((e) => (
            <ReviewItem key={`${e.id}-${e.review_status}`} contributionRef={{ _tag: 'solucion', id: e.id }} item={e}>
              <SolutionDetail e={e} />
            </ReviewItem>
          ))}
      </div>
    </main>
  )
}

const DecisionForm = Schema.Struct({ ref: ContributionRef, decision: Decision })

function ReviewItem({ contributionRef, item, children }: { contributionRef: ContributionRef; item: ItemOf<ReviewQueue['type']>; children: ReactNode }) {
  const router = useRouter()
  const t = useT()
  const q = t.review.queue
  const r = useAction(DecisionForm, decideFn, {
    onFailure: (f: Encoded<RuleViolated | InvalidTransition | ApprovalBlocked>, t): FieldErrors => {
      switch (f._tag) {
        case 'ReglaIncumplida':
          return ruleErrors(f, t)
        case 'TransicionInvalida':
          return { decision: t.invalidTransition }
        case 'AprobacionBloqueada':
          return { decision: f.blockers.map((b) => t.blocker[b]).join(' ') }
      }
    },
    onComplete: () => router.invalidate(),
  })
  const pending = item.review_status === 'pendiente'
  const headingId = `${contributionRef._tag}-${contributionRef.id}`

  return (
    <article className="card stack" aria-labelledby={headingId}>
      <header className="row">
        <Badge label={t.reviewStatus[item.review_status]} />
        <strong id={headingId}>{item.game}</strong>
        <span className="datum muted">{item.launcher}</span>
        <span className="small muted">{q.byOn(item.author, t.date(item.created_at))}</span>
        {item.demo && <span className="stamp">{t.demo.label}</span>}
      </header>
      {children}
      {item.blockers.length > 0 && (
        <ul className="note small" data-tone="amarillo" aria-label={q.blockers}>
          {item.blockers.map((b) => (
            <li key={b}>{t.blocker[b]}</li>
          ))}
        </ul>
      )}
      {item.is_own ? (
        <p className="small muted">{q.own}</p>
      ) : (
        <form className="form decision" {...r.form}>
          <FieldError errors={r.errors} field="form" />
          <input type="hidden" name="ref[_tag]" value={contributionRef._tag} />
          <input type="hidden" name="ref[id]" value={contributionRef.id} />
          <label>
            {q.reason}
            <textarea name="decision[reason]" rows={2} aria-invalid={r.errors['decision[reason]'] !== undefined} />
          </label>
          <FieldError errors={r.errors} field="decision[reason]" />
          {pending && (
            <>
              <label>
                {q.evidence}
                <textarea
                  name="decision[evidence]"
                  rows={2}
                  placeholder={q.evidencePlaceholder}
                  aria-invalid={r.errors['decision[evidence]'] !== undefined}
                />
              </label>
              <FieldError errors={r.errors} field="decision[evidence]" />
            </>
          )}
          <FieldError errors={r.errors} field="decision" />
          <div className="row">
            {pending ? (
              <>
                <button type="submit" name="decision[_tag]" value="Aprobar" disabled={r.submitting || item.blockers.length > 0}>
                  {q.approve}
                </button>
                <button type="submit" name="decision[_tag]" value="Rechazar" className="button-secondary" disabled={r.submitting}>
                  {q.reject}
                </button>
              </>
            ) : (
              <button type="submit" name="decision[_tag]" value="Retirar" className="button-secondary" disabled={r.submitting}>
                {q.withdraw}
              </button>
            )}
          </div>
        </form>
      )}
    </article>
  )
}

function ReportDetail({ e }: { e: ItemOf<'reporte'> }) {
  const t = useT()
  const q = t.review.queue
  return (
    <>
      <p className="row">
        <Badge label={t.outcome[e.outcome]} />
        <span className="datum">
          {e.distribution} · {e.architecture} · {e.layer} · {q.version(e.game_version)} · {q.testedOn(t.dateTime(e.tested_at))}
        </span>
      </p>
      <p className="small">{e.profile === null ? q.noProfile : q.followedProfile(e.profile)}</p>
      {e.avg_fps !== null && (
        <p className="small">
          <span className="fps">{t.fps(e.avg_fps)} FPS</span> · {e.resolution} · {e.graphics_quality} · {e.measurement_method}
        </p>
      )}
      {e.failures.length > 0 && (
        <ul className="small">
          {e.failures.map((f) => (
            <li key={f.code}>
              <Chip tone={t.failureType(f.code).tone}>{t.failureType(f.code).text}</Chip> {f.detail}
            </li>
          ))}
        </ul>
      )}
      <p>{e.observations}</p>
    </>
  )
}

function ProfileDetail({ e }: { e: ItemOf<'perfil'> }) {
  const t = useT()
  const lang = useLang()
  const q = t.review.queue
  return (
    <>
      <p>
        <Link to="/$lang/perfiles/$profileId" params={{ lang, profileId: e.id }}>
          <strong>{e.title}</strong>
        </Link>{' '}
        <span className="datum muted">r{e.revision}</span>
      </p>
      <p className="datum">
        {e.distribution} · {e.architecture} · {e.layer}
        {e.target_game_version !== null && ` · ${q.version(e.target_game_version)}`}
      </p>
      <p className="small">
        {q.steps(e.steps)} · {q.workingReports(e.working_reports)}
      </p>
      {e.launch_options !== null && <pre className="datum">{e.launch_options}</pre>}
    </>
  )
}

function SolutionDetail({ e }: { e: ItemOf<'solucion'> }) {
  const t = useT()
  const q = t.review.queue
  return (
    <>
      <p>
        <strong>{e.title}</strong>
      </p>
      <p className="small">
        {q.answers(
          <Chip tone={t.failureType(e.failure_type).tone}>{t.failureType(e.failure_type).text}</Chip>,
          e.failure,
          e.report_id,
          t.reviewStatus[e.report_status].text.toLowerCase(),
        )}
      </p>
      <p className="small">{e.profile === null ? q.recommendsNoProfile : q.recommends(e.profile)}</p>
      <p className="instructions">{e.instructions}</p>
    </>
  )
}
