import { createFileRoute, Link, redirect } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { myContributionsFn } from '../fns/contributions.ts'
import { Badge, Chip } from '../ui/Badge.tsx'
import { DemoStamp } from '../ui/DemoStamp.tsx'
import { SavedMachines } from '../ui/diagnostics/SavedMachines.tsx'
import { date, dateTime } from '../ui/format.ts'
import { failureType, outcome, reviewStatus } from '../ui/vocabulary.ts'
import { returnHere } from './-return-to.ts'

export const Route = createFileRoute('/mis-aportes')({
  beforeLoad: ({ context, location }) => {
    if (context.visitor === null) throw redirect({ to: '/entrar', search: returnHere(location) })
  },
  loader: () => myContributionsFn(),
  head: () => ({ meta: [{ title: 'Mis aportes · OpenGame Linux' }] }),
  component: MyContributionsPage,
})

type Review = Awaited<ReturnType<typeof myContributionsFn>>['reports'][number]['review']

function MyContributionsPage() {
  const { demo, reports, solutions, profiles, machines } = Route.useLoaderData()
  const empty = reports.length + solutions.length + profiles.length + machines.length === 0
  return (
    <main className="wrapper stack">
      <h1 className="row">Mis aportes {demo && <DemoStamp />}</h1>
      <p className="muted">
        Lo que enviaste y en qué va su revisión. Un aporte cuenta en los resúmenes solo cuando un revisor lo aprueba; si lo rechaza o lo
        retira, aquí ves el motivo.
      </p>
      {empty && (
        <section className="card stack">
          <p>Todavía no tienes aportes.</p>
          <p className="row">
            <Link to="/diagnostico">Haz el diagnóstico de tu equipo</Link>
            <span className="muted">y luego reporta cómo te funcionó un juego desde su ficha.</span>
          </p>
        </section>
      )}
      {reports.length > 0 && (
        <Section id="reportes" title="Reportes">
          {reports.map((r) => (
            <Item key={r.id} review={r.review}>
              <p className="row">
                <Link to="/juegos/$gameId" params={{ gameId: r.game_id }}>
                  <strong>{r.game}</strong>
                </Link>
                <span className="datum muted">{r.launcher}</span>
                <Badge label={outcome[r.outcome]} />
              </p>
              <p className="datum">
                {r.distribution} · {r.layer} · versión {r.game_version} · probado el {dateTime(r.tested_at)}
              </p>
              <Sent at={r.created_at} />
              {r.valve && (
                <p className="small">
                  <Link to="/reportes/$reportId/proton" params={{ reportId: r.id }}>
                    Prepara el informe para Valve
                  </Link>
                </p>
              )}
            </Item>
          ))}
        </Section>
      )}
      {solutions.length > 0 && (
        <Section id="soluciones" title="Soluciones">
          {solutions.map((s) => (
            <Item key={s.id} review={s.review}>
              <p>
                <strong>{s.title}</strong>
              </p>
              <p className="row small">
                Para <Chip tone={failureType(s.failure_type).tone}>{failureType(s.failure_type).text}</Chip> en
                <Link to="/juegos/$gameId" params={{ gameId: s.game_id }}>
                  {s.game}
                </Link>
              </p>
              <Sent at={s.created_at} />
            </Item>
          ))}
        </Section>
      )}
      {profiles.length > 0 && (
        <Section id="perfiles" title="Perfiles de configuración">
          {profiles.map((p) => (
            <Item key={p.id} review={p.review}>
              <p className="row">
                {/* A rejected or retired profile has no public page; its game still does. */}
                {'reason' in p.review ? (
                  <strong>{p.title}</strong>
                ) : (
                  <Link to="/perfiles/$profileId" params={{ profileId: p.id }}>
                    <strong>{p.title}</strong>
                  </Link>
                )}
                <span className="datum muted">r{p.revision}</span>
              </p>
              <p className="small">
                Para{' '}
                <Link to="/juegos/$gameId" params={{ gameId: p.game_id }}>
                  {p.game}
                </Link>
              </p>
              <Sent at={p.created_at} />
            </Item>
          ))}
        </Section>
      )}
      {machines.length > 0 && (
        <section className="stack" aria-labelledby="diagnosticos">
          <h2 id="diagnosticos" className="section-title">
            Diagnósticos guardados
          </h2>
          <p className="small muted">Solo tú los ves. Un reporte muestra el contexto técnico de su diagnóstico, no tu correo.</p>
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

function Item({ review, children }: { review: Review; children: ReactNode }) {
  return (
    <li className="card stack">
      <p>
        <Badge label={reviewStatus[review.status]} />
      </p>
      {children}
      {'reason' in review && (
        <p className="note small" data-tone={reviewStatus[review.status].tone}>
          Motivo de la revisión: {review.reason}
        </p>
      )}
    </li>
  )
}

function Sent({ at }: { at: Date }) {
  return <p className="small muted">Enviado el {date(at)}</p>
}
