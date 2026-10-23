import { createFileRoute, Link, redirect } from '@tanstack/react-router'
import { Schema } from 'effect'
import { useState } from 'react'
import { NewSolution } from '../../../domain/contributions.ts'
import { ReportId, FailureTypeId } from '../../../domain/ids.ts'
import { solutionOptionsFn, submitSolutionFn } from '../../../fns/contributions.ts'
import { FieldError } from '../../../ui/FieldError.tsx'
import { dateTime } from '../../../ui/format.ts'
import { Field, fieldProps, nullText } from '../../../ui/form.tsx'
import { Badge } from '../../../ui/Badge.tsx'
import { ruleErrors, useAction } from '../../../ui/useAction.ts'
import { reviewStatus, outcome, failureType } from '../../../ui/vocabulary.ts'
import { routeIdParser } from '../../-ids.ts'
import { returnHere } from '../../-return-to.ts'

const reportId = routeIdParser(ReportId)

export const Route = createFileRoute('/$lang/reportes/$reportId/solucion')({
  params: { parse: (p) => ({ reportId: reportId(p.reportId) }), stringify: (p) => ({ reportId: String(p.reportId) }) },
  validateSearch: Schema.toStandardSchemaV1(Schema.Struct({ tipoFallo: Schema.optionalKey(FailureTypeId) })),
  beforeLoad: ({ context, location }) => {
    if (context.visitor === null) throw redirect({ to: '/entrar', search: returnHere(location) })
  },
  loader: ({ params }) => solutionOptionsFn({ data: { reportId: params.reportId } }),
  head: ({ loaderData }) => ({ meta: [{ title: `Proponer solución · ${loaderData?.report.game ?? 'OpenGame Linux'}` }] }),
  component: ProposeSolutionPage,
})

function ProposeSolutionPage() {
  const { report, failures, profiles } = Route.useLoaderData()
  const { tipoFallo: preselected } = Route.useSearch()
  const [submitted, setSubmitted] = useState(false)
  const r = useAction(NewSolution, submitSolutionFn, { onFailure: ruleErrors, onComplete: () => setSubmitted(true) })

  return (
    <main className="wrapper">
      <p className="caption">Proponer solución</p>
      <h1>{report.game}</h1>
      <section className="card stack">
        <p className="row">
          <Badge label={outcome[report.outcome]} />
          <Badge label={reviewStatus[report.review_status]} />
          <span className="datum">
            {report.launcher} · {report.distribution} · {report.layer} · versión {report.game_version} · {dateTime(report.tested_at)}
          </span>
        </p>
        <p>{report.observations}</p>
      </section>

      {submitted ? (
        <section className="card stack" aria-live="polite">
          <h2>Solución enviada</h2>
          <p>
            Queda <strong>pendiente de revisión</strong>. Para publicarla, un revisor necesita evidencia de que resuelve el fallo, no solo que el fallo existe.
          </p>
          <p>
            <Link to="/juegos/$gameId" params={{ gameId: report.game_id }}>
              Volver a la ficha del juego
            </Link>
          </p>
        </section>
      ) : (
        <form className="card form form-wide" {...r.form}>
          <FieldError errors={r.errors} field="form" />
          <input type="hidden" name="report_id" value={report.id} />
          <Field errors={r.errors} name="failure_type_id" label="Fallo que resuelve">
            <select {...fieldProps(r.errors, 'failure_type_id')} defaultValue={failures.find((f) => f.failure_type_id === preselected)?.failure_type_id}>
              {failures.map((f) => (
                <option key={f.failure_type_id} value={f.failure_type_id}>
                  {failureType(f.code).text}: {f.detail}
                </option>
              ))}
            </select>
          </Field>
          <Field
            errors={r.errors}
            name="profile_id"
            label="Perfil que recomiendas (opcional)"
            help="Solo perfiles de la misma edición. Si recomiendas uno pendiente, la solución no se aprueba hasta que el perfil lo esté."
          >
            <select {...fieldProps(r.errors, 'profile_id')} defaultValue={nullText}>
              <option value={nullText}>Ninguno: describo otra acción</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title} (r{p.revision}, {reviewStatus[p.review_status].text.toLowerCase()})
                </option>
              ))}
            </select>
          </Field>
          <Field errors={r.errors} name="title" label="Título">
            <input {...fieldProps(r.errors, 'title')} placeholder="Reinstalar el lanzador dentro del prefijo" />
          </Field>
          <Field errors={r.errors} name="instructions" label="Instrucciones" help="Pasos concretos para resolver el fallo o aplicar la alternativa.">
            <textarea {...fieldProps(r.errors, 'instructions')} rows={6} />
          </Field>
          <button type="submit" disabled={r.submitting}>
            {r.submitting ? 'Enviando…' : 'Enviar solución'}
          </button>
        </form>
      )}
    </main>
  )
}
