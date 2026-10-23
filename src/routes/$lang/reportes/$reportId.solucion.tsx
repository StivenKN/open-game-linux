import { createFileRoute, Link, redirect } from '@tanstack/react-router'
import { Schema } from 'effect'
import { useState } from 'react'
import { NewSolution } from '../../../domain/contributions.ts'
import { ReportId, FailureTypeId } from '../../../domain/ids.ts'
import { solutionOptionsFn, submitSolutionFn } from '../../../fns/contributions.ts'
import { FieldError } from '../../../ui/FieldError.tsx'
import { Field, fieldProps, nullText } from '../../../ui/form.tsx'
import { Badge } from '../../../ui/Badge.tsx'
import { messages, useLang, useT } from '../../../ui/i18n/messages.ts'
import { ruleErrors, useAction } from '../../../ui/useAction.ts'
import { routeIdParser } from '../../-ids.ts'
import { returnHere } from '../../-return-to.ts'

const reportId = routeIdParser(ReportId)

export const Route = createFileRoute('/$lang/reportes/$reportId/solucion')({
  params: { parse: (p) => ({ reportId: reportId(p.reportId) }), stringify: (p) => ({ reportId: String(p.reportId) }) },
  validateSearch: Schema.toStandardSchemaV1(Schema.Struct({ tipoFallo: Schema.optionalKey(FailureTypeId) })),
  beforeLoad: ({ context, location, params }) => {
    if (context.visitor === null) throw redirect({ to: '/$lang/entrar', params: { lang: params.lang }, search: returnHere(location) })
  },
  loader: ({ params }) => solutionOptionsFn({ data: { reportId: params.reportId } }),
  head: ({ loaderData, params }) => ({ meta: [{ title: messages[params.lang].report.solution.title(loaderData?.report.game ?? 'OpenGame Linux') }] }),
  component: ProposeSolutionPage,
})

function ProposeSolutionPage() {
  const { report, failures, profiles } = Route.useLoaderData()
  const { tipoFallo: preselected } = Route.useSearch()
  const [submitted, setSubmitted] = useState(false)
  const r = useAction(NewSolution, submitSolutionFn, { onFailure: ruleErrors, onComplete: () => setSubmitted(true) })
  const t = useT()
  const lang = useLang()
  const s = t.report.solution

  return (
    <main className="wrapper">
      <p className="caption">{s.caption}</p>
      <h1>{report.game}</h1>
      <section className="card stack">
        <p className="row">
          <Badge label={t.outcome[report.outcome]} />
          <Badge label={t.reviewStatus[report.review_status]} />
          <span className="datum">
            {report.launcher} · {report.distribution} · {report.layer} · {s.gameVersion(report.game_version)} · {t.dateTime(report.tested_at)}
          </span>
        </p>
        <p>{report.observations}</p>
      </section>

      {submitted ? (
        <section className="card stack" aria-live="polite">
          <h2>{s.sent.heading}</h2>
          <p>{s.sent.pending}</p>
          <p>
            <Link to="/$lang/juegos/$gameId" params={{ lang, gameId: report.game_id }}>
              {t.report.backToGame}
            </Link>
          </p>
        </section>
      ) : (
        <form className="card form form-wide" {...r.form}>
          <FieldError errors={r.errors} field="form" />
          <input type="hidden" name="report_id" value={report.id} />
          <Field errors={r.errors} name="failure_type_id" label={s.failure}>
            <select {...fieldProps(r.errors, 'failure_type_id')} defaultValue={failures.find((f) => f.failure_type_id === preselected)?.failure_type_id}>
              {failures.map((f) => (
                <option key={f.failure_type_id} value={f.failure_type_id}>
                  {t.failureType(f.code).text}: {f.detail}
                </option>
              ))}
            </select>
          </Field>
          <Field errors={r.errors} name="profile_id" label={s.profile.label} help={s.profile.help}>
            <select {...fieldProps(r.errors, 'profile_id')} defaultValue={nullText}>
              <option value={nullText}>{s.profile.none}</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title} (r{p.revision}, {t.reviewStatus[p.review_status].text.toLowerCase()})
                </option>
              ))}
            </select>
          </Field>
          <Field errors={r.errors} name="title" label={s.solutionTitle.label}>
            <input {...fieldProps(r.errors, 'title')} placeholder={s.solutionTitle.example} />
          </Field>
          <Field errors={r.errors} name="instructions" label={s.instructions.label} help={s.instructions.help}>
            <textarea {...fieldProps(r.errors, 'instructions')} rows={6} />
          </Field>
          <button type="submit" disabled={r.submitting}>
            {r.submitting ? t.report.sending : s.submit}
          </button>
        </form>
      )}
    </main>
  )
}
