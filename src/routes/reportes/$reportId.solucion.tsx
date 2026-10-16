import { createFileRoute, Link, redirect } from '@tanstack/react-router'
import { Schema } from 'effect'
import { useState } from 'react'
import { NewSolution } from '../../domain/contributions.ts'
import { ReportId, FailureTypeId } from '../../domain/ids.ts'
import { solutionOptionsFn, submitSolutionFn } from '../../fns/contributions.ts'
import { FieldError } from '../../ui/FieldError.tsx'
import { dateTime } from '../../ui/format.ts'
import { Field, fieldProps, nullText } from '../../ui/form.tsx'
import { Badge } from '../../ui/Badge.tsx'
import { ruleErrors, useAction } from '../../ui/useAction.ts'
import { reviewStatus, outcome, failureType } from '../../ui/vocabulary.ts'
import { routeIdParser } from '../-ids.ts'
import { returnHere } from '../-return-to.ts'

const reportId = routeIdParser(ReportId)

export const Route = createFileRoute('/reportes/$reportId/solucion')({
  params: { parse: (p) => ({ reportId: reportId(p.reportId) }), stringify: (p) => ({ reportId: String(p.reportId) }) },
  validateSearch: Schema.toStandardSchemaV1(Schema.Struct({ tipoFallo: Schema.optionalKey(FailureTypeId) })),
  beforeLoad: ({ context, location }) => {
    if (context.visitor === null) throw redirect({ to: '/entrar', search: returnHere(location) })
  },
  loader: ({ params }) => solutionOptionsFn({ data: { reportId: params.reportId } }),
  head: ({ loaderData }) => ({ meta: [{ title: `Proponer solución · ${loaderData?.report.juego ?? 'OpenGame Linux'}` }] }),
  component: ProposeSolutionPage,
})

function ProposeSolutionPage() {
  const { report, failures, profiles } = Route.useLoaderData()
  const { tipoFallo: preselected } = Route.useSearch()
  const [submitted, setSubmitted] = useState(false)
  const r = useAction(NewSolution, submitSolutionFn, { onFailure: ruleErrors, onComplete: () => setSubmitted(true) })

  return (
    <main className="envoltura">
      <p className="rotulo">Proponer solución</p>
      <h1>{report.juego}</h1>
      <section className="tarjeta pila">
        <p className="fila">
          <Badge label={outcome[report.resultado]} />
          <Badge label={reviewStatus[report.estado_revision]} />
          <span className="dato">
            {report.lanzador} · {report.distribucion} · {report.capa} · versión {report.version_juego} · {dateTime(report.fecha_prueba)}
          </span>
        </p>
        <p>{report.observaciones}</p>
      </section>

      {submitted ? (
        <section className="tarjeta pila" aria-live="polite">
          <h2>Solución enviada</h2>
          <p>
            Queda <strong>pendiente de revisión</strong>. Para publicarla, un revisor necesita evidencia de que resuelve el fallo, no solo que el fallo existe.
          </p>
          <p>
            <Link to="/juegos/$gameId" params={{ gameId: report.juego_id }}>
              Volver a la ficha del juego
            </Link>
          </p>
        </section>
      ) : (
        <form className="tarjeta formulario formulario-ancho" {...r.form}>
          <FieldError errors={r.errors} field="formulario" />
          <input type="hidden" name="reporte_id" value={report.id} />
          <Field errors={r.errors} name="tipo_fallo_id" label="Fallo que resuelve">
            <select {...fieldProps(r.errors, 'tipo_fallo_id')} defaultValue={failures.find((f) => f.tipo_fallo_id === preselected)?.tipo_fallo_id}>
              {failures.map((f) => (
                <option key={f.tipo_fallo_id} value={f.tipo_fallo_id}>
                  {failureType(f.codigo).text}: {f.detalle}
                </option>
              ))}
            </select>
          </Field>
          <Field
            errors={r.errors}
            name="perfil_id"
            label="Perfil que recomiendas (opcional)"
            help="Solo perfiles de la misma edición. Si recomiendas uno pendiente, la solución no se aprueba hasta que el perfil lo esté."
          >
            <select {...fieldProps(r.errors, 'perfil_id')} defaultValue={nullText}>
              <option value={nullText}>Ninguno: describo otra acción</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.titulo} (r{p.revision}, {reviewStatus[p.estado_revision].text.toLowerCase()})
                </option>
              ))}
            </select>
          </Field>
          <Field errors={r.errors} name="titulo" label="Título">
            <input {...fieldProps(r.errors, 'titulo')} placeholder="Reinstalar el lanzador dentro del prefijo" />
          </Field>
          <Field errors={r.errors} name="instrucciones" label="Instrucciones" help="Pasos concretos para resolver el fallo o aplicar la alternativa.">
            <textarea {...fieldProps(r.errors, 'instrucciones')} rows={6} />
          </Field>
          <button type="submit" disabled={r.submitting}>
            {r.submitting ? 'Enviando…' : 'Enviar solución'}
          </button>
        </form>
      )}
    </main>
  )
}
