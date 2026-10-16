import { createFileRoute, Link, notFound, redirect, useRouter } from '@tanstack/react-router'
import { Schema } from 'effect'
import type { ReactNode } from 'react'
import { invalidTransitionNotice, type ApprovalBlocked, type Encoded, type RuleViolated, type InvalidTransition } from '../domain/errors.ts'
import { ContributionRef, Decision, ContributionType } from '../domain/review.ts'
import { queueFn, decideFn } from '../fns/review.ts'
import { Chip, Badge } from '../ui/Badge.tsx'
import { FieldError } from '../ui/FieldError.tsx'
import { count, date, fps, dateTime } from '../ui/format.ts'
import { ruleErrors, type FieldErrors, useAction } from '../ui/useAction.ts'
import { blocker, reviewStatus, outcome, failureType } from '../ui/vocabulary.ts'
import { returnHere } from './-return-to.ts'

export const Route = createFileRoute('/revision')({
  validateSearch: Schema.toStandardSchemaV1(Schema.Struct({ tipo: Schema.optionalKey(ContributionType) })),
  beforeLoad: ({ context, location }) => {
    if (context.visitor === null) throw redirect({ to: '/entrar', search: returnHere(location) })
    if (context.visitor.rol === 'usuario') throw notFound()
  },
  loaderDeps: ({ search }) => ({ tipo: search.tipo ?? 'reporte' }),
  loader: ({ deps }) => queueFn({ data: deps }),
  head: () => ({ meta: [{ title: 'Revisión · OpenGame Linux' }] }),
  component: ReviewPage,
})

const tabs = { reporte: 'Reportes', perfil: 'Perfiles', solucion: 'Soluciones' } as const satisfies Record<ContributionType, string>

type ReviewQueue = Awaited<ReturnType<typeof queueFn>>
type ItemOf<T extends ReviewQueue['type']> = Extract<ReviewQueue, { type: T }>['items'][number]

function ReviewPage() {
  const queue = Route.useLoaderData()
  const pendingCount = queue.items.filter((e) => e.estado_revision === 'pendiente').length
  return (
    <main className="envoltura">
      <h1>Revisión de aportes</h1>
      <p className="tenue">
        Aprobar exige evidencia verificable. Lo pendiente no cuenta en ningún resumen; lo aprobado se puede retirar si deja de ser válido.
      </p>
      <nav aria-label="Tipo de aporte" className="fila pestanas">
        {ContributionType.literals.map((t) => (
          <Link key={t} to="/revision" search={{ tipo: t }} aria-current={t === queue.type ? 'page' : undefined} className={t === queue.type ? 'boton' : 'boton-secundario'}>
            {tabs[t]}
          </Link>
        ))}
      </nav>
      <p className="pequeno tenue">{count(pendingCount, 'pendiente', 'pendientes')}</p>
      {queue.items.length === 0 && <p className="tarjeta">No hay {tabs[queue.type].toLowerCase()} pendientes ni aprobados.</p>}
      {/* Keyed by state too, so a decided row remounts with an empty form instead of keeping the old motivo. */}
      <div className="pila">
        {queue.type === 'reporte' &&
          queue.items.map((e) => (
            <ReviewItem key={`${e.id}-${e.estado_revision}`} contributionRef={{ _tag: 'reporte', id: e.id }} item={e}>
              <ReportDetail e={e} />
            </ReviewItem>
          ))}
        {queue.type === 'perfil' &&
          queue.items.map((e) => (
            <ReviewItem key={`${e.id}-${e.estado_revision}`} contributionRef={{ _tag: 'perfil', id: e.id }} item={e}>
              <ProfileDetail e={e} />
            </ReviewItem>
          ))}
        {queue.type === 'solucion' &&
          queue.items.map((e) => (
            <ReviewItem key={`${e.id}-${e.estado_revision}`} contributionRef={{ _tag: 'solucion', id: e.id }} item={e}>
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
  const r = useAction(DecisionForm, decideFn, {
    onFailure: (f: Encoded<RuleViolated | InvalidTransition | ApprovalBlocked>): FieldErrors => {
      switch (f._tag) {
        case 'ReglaIncumplida':
          return ruleErrors(f)
        case 'TransicionInvalida':
          return { decision: invalidTransitionNotice.message }
        case 'AprobacionBloqueada':
          return { decision: f.blockers.map((b) => blocker[b]).join(' ') }
      }
    },
    onComplete: () => router.invalidate(),
  })
  const pending = item.estado_revision === 'pendiente'
  const headingId = `${contributionRef._tag}-${contributionRef.id}`

  return (
    <article className="tarjeta pila" aria-labelledby={headingId}>
      <header className="fila">
        <Badge label={reviewStatus[item.estado_revision]} />
        <strong id={headingId}>{item.juego}</strong>
        <span className="dato tenue">{item.lanzador}</span>
        <span className="pequeno tenue">
          por {item.autor} · {date(item.creado_en)}
        </span>
        {item.demo && <span className="sello">Datos de ejemplo</span>}
      </header>
      {children}
      {item.blockers.length > 0 && (
        <ul className="nota pequeno" data-tono="amarillo" aria-label="Por qué no se puede aprobar todavía">
          {item.blockers.map((b) => (
            <li key={b}>{blocker[b]}</li>
          ))}
        </ul>
      )}
      {item.es_propio ? (
        <p className="pequeno tenue">Es tu aporte: otro revisor debe decidir sobre él.</p>
      ) : (
        <form className="formulario decision" {...r.form}>
          <FieldError errors={r.errors} field="formulario" />
          <input type="hidden" name="ref[_tag]" value={contributionRef._tag} />
          <input type="hidden" name="ref[id]" value={contributionRef.id} />
          <label>
            Motivo
            <textarea name="decision[motivo]" rows={2} aria-invalid={r.errors['decision[motivo]'] !== undefined} />
          </label>
          <FieldError errors={r.errors} field="decision[motivo]" />
          {pending && (
            <>
              <label>
                Evidencia (para aprobar)
                <textarea
                  name="decision[evidencia]"
                  rows={2}
                  placeholder="Referencia verificable: captura, registro o reporte identificado"
                  aria-invalid={r.errors['decision[evidencia]'] !== undefined}
                />
              </label>
              <FieldError errors={r.errors} field="decision[evidencia]" />
            </>
          )}
          <FieldError errors={r.errors} field="decision" />
          <div className="fila">
            {pending ? (
              <>
                <button type="submit" name="decision[_tag]" value="Aprobar" disabled={r.submitting || item.blockers.length > 0}>
                  Aprobar
                </button>
                <button type="submit" name="decision[_tag]" value="Rechazar" className="boton-secundario" disabled={r.submitting}>
                  Rechazar
                </button>
              </>
            ) : (
              <button type="submit" name="decision[_tag]" value="Retirar" className="boton-secundario" disabled={r.submitting}>
                Retirar
              </button>
            )}
          </div>
        </form>
      )}
    </article>
  )
}

function ReportDetail({ e }: { e: ItemOf<'reporte'> }) {
  return (
    <>
      <p className="fila">
        <Badge label={outcome[e.resultado]} />
        <span className="dato">
          {e.distribucion} · {e.arquitectura} · {e.capa} · versión {e.version_juego} · probado el {dateTime(e.fecha_prueba)}
        </span>
      </p>
      <p className="pequeno">{e.perfil === null ? 'Sin perfil.' : `Siguió el perfil «${e.perfil}».`}</p>
      {e.fps_promedio !== null && (
        <p className="pequeno">
          <span className="fps">{fps(e.fps_promedio)} FPS</span> · {e.resolucion} · {e.calidad_grafica} · {e.metodo_medicion}
        </p>
      )}
      {e.fallos.length > 0 && (
        <ul className="pequeno">
          {e.fallos.map((f) => (
            <li key={f.codigo}>
              <Chip tone={failureType(f.codigo).tone}>{failureType(f.codigo).text}</Chip> {f.detalle}
            </li>
          ))}
        </ul>
      )}
      <p>{e.observaciones}</p>
    </>
  )
}

function ProfileDetail({ e }: { e: ItemOf<'perfil'> }) {
  return (
    <>
      <p>
        <strong>{e.titulo}</strong> <span className="dato tenue">r{e.revision}</span>
      </p>
      <p className="dato">
        {e.distribucion} · {e.arquitectura} · {e.capa}
        {e.version_juego_objetivo !== null && ` · versión ${e.version_juego_objetivo}`}
      </p>
      <p className="pequeno">
        {count(e.pasos, 'paso', 'pasos')} · {count(e.reportes_funcionales, 'reporte funcional aprobado', 'reportes funcionales aprobados')}
      </p>
      {e.parametros_lanzamiento !== null && <pre className="dato">{e.parametros_lanzamiento}</pre>}
    </>
  )
}

function SolutionDetail({ e }: { e: ItemOf<'solucion'> }) {
  return (
    <>
      <p>
        <strong>{e.titulo}</strong>
      </p>
      <p className="pequeno">
        Responde a <Chip tone={failureType(e.tipo_fallo).tone}>{failureType(e.tipo_fallo).text}</Chip> «{e.fallo}» del reporte #{e.reporte_id} (
        {reviewStatus[e.estado_reporte].text.toLowerCase()}).
      </p>
      <p className="pequeno">{e.perfil === null ? 'No recomienda un perfil.' : `Recomienda el perfil «${e.perfil}».`}</p>
      <p className="instrucciones">{e.instrucciones}</p>
    </>
  )
}
