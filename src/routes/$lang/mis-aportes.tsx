import { createFileRoute, Link, redirect } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { myContributionsFn } from '../../fns/contributions.ts'
import { Badge, Chip } from '../../ui/Badge.tsx'
import { DemoStamp } from '../../ui/DemoStamp.tsx'
import { SavedMachines } from '../../ui/diagnostics/SavedMachines.tsx'
import { useLang, useT } from '../../ui/i18n/messages.ts'
import { titled } from '../-head.ts'
import { returnHere } from '../-return-to.ts'

export const Route = createFileRoute('/$lang/mis-aportes')({
  beforeLoad: ({ context, location, params }) => {
    if (context.visitor === null) throw redirect({ to: '/$lang/entrar', params: { lang: params.lang }, search: returnHere(location) })
  },
  loader: () => myContributionsFn(),
  head: ({ params }) => titled(params.lang, (t) => t.header.myContributions),
  component: MyContributionsPage,
})

type Review = Awaited<ReturnType<typeof myContributionsFn>>['reports'][number]['review']

function MyContributionsPage() {
  const { demo, reports, solutions, profiles, machines, requests } = Route.useLoaderData()
  const t = useT()
  const lang = useLang()
  const m = t.account.myContributions
  const empty = reports.length + solutions.length + profiles.length + machines.length + requests.length === 0
  return (
    <main className="wrapper stack">
      <h1 className="row">
        {t.header.myContributions} {demo && <DemoStamp />}
      </h1>
      <p className="muted">{m.lede}</p>
      {empty && (
        <section className="card stack">
          <p>{m.empty}</p>
          <p className="row">
            <Link to="/$lang/diagnostico" params={{ lang }}>
              {m.diagnose}
            </Link>
            <span className="muted">{m.thenReport}</span>
          </p>
        </section>
      )}
      {reports.length > 0 && (
        <Section id="reportes" title={m.reports}>
          {reports.map((r) => (
            <Item key={r.id} review={r.review} sent={r.created_at}>
              <p className="row">
                <Link to="/$lang/juegos/$gameId" params={{ lang, gameId: r.game_id }}>
                  <strong>{r.game}</strong>
                </Link>
                <span className="datum muted">{r.launcher}</span>
                <Badge label={t.outcome[r.outcome]} />
              </p>
              <p className="datum">
                {r.distribution} · {r.layer} · {m.version(r.game_version)} · {m.testedOn(t.dateTime(r.tested_at))}
              </p>
              {r.valve && (
                <p className="small">
                  <Link to="/$lang/reportes/$reportId/proton" params={{ lang, reportId: r.id }}>
                    {m.valve}
                  </Link>
                </p>
              )}
            </Item>
          ))}
        </Section>
      )}
      {solutions.length > 0 && (
        <Section id="soluciones" title={m.solutions}>
          {solutions.map((s) => (
            <Item key={s.id} review={s.review} sent={s.created_at}>
              <p>
                <strong>{s.title}</strong>
              </p>
              <p className="row small">
                {m.forFailureIn(
                  <Chip tone={t.failureType(s.failure_type).tone}>{t.failureType(s.failure_type).text}</Chip>,
                  <Link to="/$lang/juegos/$gameId" params={{ lang, gameId: s.game_id }}>
                    {s.game}
                  </Link>,
                )}
              </p>
            </Item>
          ))}
        </Section>
      )}
      {profiles.length > 0 && (
        <Section id="perfiles" title={m.profiles}>
          {profiles.map((p) => (
            <Item key={p.id} review={p.review} sent={p.created_at} action={<ProfileAction profile={p} />}>
              <p className="row">
                {/* A rejected or retired profile has no public page; its game still does. */}
                {'reason' in p.review ? (
                  <strong>{p.title}</strong>
                ) : (
                  <Link to="/$lang/perfiles/$profileId" params={{ lang, profileId: p.id }}>
                    <strong>{p.title}</strong>
                  </Link>
                )}
                <span className="datum muted">r{p.revision}</span>
              </p>
              <p className="small">
                {m.forGame(
                  <Link to="/$lang/juegos/$gameId" params={{ lang, gameId: p.game_id }}>
                    {p.game}
                  </Link>,
                )}
              </p>
            </Item>
          ))}
        </Section>
      )}
      {requests.length > 0 && (
        <Section id="pedidos" title={m.requests}>
          {requests.map((r) => (
            <li key={r.id} className="card stack">
              <p className="row">
                <Badge label={t.gameRequestStatus[r.status]} />
                <span className="small muted">{m.requestedOn(t.date(r.requested_at))}</span>
              </p>
              <p>
                <strong>{r.title}</strong>
              </p>
              {r.status === 'abierto' && (
                <p className="row small">
                  <span className="muted">{m.requesters(r.requesters)}</span>
                  <Link to="/$lang/pedidos" params={{ lang }} hash={`pedido-${r.id}`}>
                    {m.viewOpen}
                  </Link>
                </p>
              )}
              {r.status === 'cumplido' && (
                <p className="small">
                  {m.added(t.date(r.resolved_at))}{' '}
                  <Link to="/$lang/juegos/$gameId" params={{ lang, gameId: r.game_id }}>
                    {m.viewGame(r.game)}
                  </Link>
                </p>
              )}
              {r.status === 'rechazado' && (
                <p className="note small" data-tone={t.gameRequestStatus.rechazado.tone}>
                  {m.rejected(t.date(r.resolved_at), r.rejection_reason)}
                </p>
              )}
            </li>
          ))}
        </Section>
      )}
      {machines.length > 0 && (
        <section className="stack" aria-labelledby="diagnosticos">
          <h2 id="diagnosticos" className="section-title">
            {m.diagnoses}
          </h2>
          <p className="small muted">{m.diagnosesHelp}</p>
          <SavedMachines machines={machines} />
        </section>
      )}
    </main>
  )
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id}>
      <h2 id={id} className="section-title">
        {title}
      </h2>
      <ul className="card-list">{children}</ul>
    </section>
  )
}

type MyProfile = Awaited<ReturnType<typeof myContributionsFn>>['profiles'][number]

/** Its author edits a proposal nobody used yet, and reworks a refused one into a new version. */
function ProfileAction({ profile: p }: { profile: MyProfile }) {
  const t = useT()
  const lang = useLang()
  if (p.editable)
    return (
      <p className="small">
        <Link to="/$lang/perfiles/$profileId/editar" params={{ lang, profileId: p.id }}>
          {t.account.myContributions.editProposal}
        </Link>
      </p>
    )
  if (!('reason' in p.review)) return null
  return (
    <p className="small">
      <Link to="/$lang/juegos/$gameId/perfiles/nuevo" params={{ lang, gameId: p.game_id }} search={{ desde: p.id }}>
        {t.account.myContributions.proposeChanges}
      </Link>
    </p>
  )
}

/** `action` comes after the reviewer's reason, so a refused item reads the why before the what next. */
function Item({ review, sent, action, children }: { review: Review; sent: Date; action?: ReactNode; children: ReactNode }) {
  const t = useT()
  return (
    <li className="card stack">
      <p className="row">
        <Badge label={t.reviewStatus[review.status]} />
        <span className="small muted">{t.account.myContributions.sentOn(t.date(sent))}</span>
      </p>
      {children}
      {'reason' in review && (
        <p className="note small" data-tone={t.reviewStatus[review.status].tone}>
          {t.account.myContributions.reviewReason(review.reason)}
        </p>
      )}
      {action}
    </li>
  )
}
