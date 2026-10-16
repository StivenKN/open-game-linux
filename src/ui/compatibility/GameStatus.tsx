import type { CompatibilitySummary } from '../../domain/compatibility.ts'
import { Outcome } from '../../domain/literals.ts'
import { count, date } from '../format.ts'
import { compatibilityStatus, outcome, statusMeaning } from '../vocabulary.ts'
import { FailureChips } from './FailureChips.tsx'

export function GameStatus({ summary, pending }: { summary: CompatibilitySummary; pending: number }) {
  const label = compatibilityStatus[summary.status]
  const base = summary.no_recent_confirmation ? summary.test_count : summary.recent_count
  // The environments the state counts, so the bar adds up to `base`.
  const counted = summary.setups.filter((e) => e.recent_count > 0 || summary.no_recent_confirmation)
  const breakdown = Outcome.literals.flatMap((r) => {
    const n = counted.reduce((total, e) => total + (e.by_outcome[r] ?? 0), 0)
    return n > 0 ? [{ outcome: r, n }] : []
  })
  return (
    <section className="veredicto" data-tono={label.tone} aria-label="Estado de compatibilidad">
      <div className="veredicto-cabeza">
        <span className="veredicto-icono" data-tono={label.tone} data-forma="relleno" data-estado={summary.status} aria-hidden="true">
          {label.icon}
        </span>
        <div>
          <p className="veredicto-estado">{label.text}</p>
          <p className="veredicto-base">
            {summary.last_tested ? (
              <>
                Según <b>{count(base, 'reporte aprobado', 'reportes aprobados')}</b>
                {base < summary.test_count && <> del último año ({summary.test_count} en total)</>}. Última prueba el{' '}
                {date(summary.last_tested)}.
              </>
            ) : (
              'Todavía no hay reportes aprobados.'
            )}
          </p>
        </div>
      </div>
      <p className="veredicto-significa">{statusMeaning[summary.status]}</p>
      {summary.no_recent_confirmation && (
        <p className="nota pequeno" data-tono="amarillo">
          Sin confirmación en el último año: todos los reportes aprobados tienen más de 12 meses.
        </p>
      )}
      {summary.regressions.map((r) => (
        <p key={r.edition_id} className="nota pequeno" data-tono="rojo">
          <b>Dejó de funcionar</b> en {r.launcher}: la prueba más reciente ({date(r.tested_at)}, versión {r.game_version},{' '}
          {r.layer}) dio «{outcome[r.outcome].text}» después de reportes que funcionaban.
        </p>
      ))}
      {breakdown.length > 0 && (
        <>
          <div className="reparto" aria-hidden="true">
            {breakdown.map((x) => (
              <span key={x.outcome} data-tono={outcome[x.outcome].tone} data-forma="relleno" style={{ flexGrow: x.n }} />
            ))}
          </div>
          <ul className="leyenda-reparto" aria-label="Resultados aprobados">
            {breakdown.map((x) => (
              <li key={x.outcome}>
                <i data-tono={outcome[x.outcome].tone} data-forma="relleno" />
                {x.n} {outcome[x.outcome].text.toLowerCase()}
              </li>
            ))}
          </ul>
        </>
      )}
      {summary.failures.length > 0 && (
        <p className="pequeno">
          Causas observadas: <FailureChips failures={summary.failures} />
        </p>
      )}
      {pending > 0 && (
        <p className="pendiente">
          {pending === 1
            ? '1 reporte más espera revisión y todavía no cuenta.'
            : `${pending} reportes más esperan revisión y todavía no cuentan.`}
        </p>
      )}
      <p className="pequeno tenue">
        El estado se calcula al consultar a partir de los reportes aprobados del último año, o de todos si ninguno es tan
        reciente. Un resultado favorable no garantiza que funcione en cualquier equipo.
      </p>
    </section>
  )
}
