import type { ReactNode } from 'react'
import type { CompatibilitySummary } from '../../domain/compatibility.ts'
import { Outcome } from '../../domain/literals.ts'
import { count, date } from '../format.ts'
import { compatibilityStatus, outcome, statusMeaning } from '../vocabulary.ts'
import { FailureChips } from './FailureChips.tsx'

/** The game's computed state. `children` goes under its meaning, e.g. the "En Steam Deck" line. */
export function GameStatus({ summary, pending, children }: { summary: CompatibilitySummary; pending: number; children?: ReactNode }) {
  const label = compatibilityStatus[summary.status]
  const base = summary.no_recent_confirmation ? summary.test_count : summary.recent_count
  // The environments the state counts, so the bar adds up to `base`.
  const counted = summary.setups.filter((e) => e.recent_count > 0 || summary.no_recent_confirmation)
  const breakdown = Outcome.literals.flatMap((r) => {
    const n = counted.reduce((total, e) => total + (e.by_outcome[r] ?? 0), 0)
    return n > 0 ? [{ outcome: r, n }] : []
  })
  return (
    <section className="verdict" data-tone={label.tone} aria-label="Estado de compatibilidad">
      <div className="verdict-head">
        <span className="verdict-icon" data-tone={label.tone} data-shape="relleno" data-state={summary.status} aria-hidden="true">
          {label.icon}
        </span>
        <div>
          <p className="verdict-status">{label.text}</p>
          <p className="verdict-base">
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
      <p className="verdict-meaning">{statusMeaning[summary.status]}</p>
      {children}
      {summary.no_recent_confirmation && (
        <p className="note small" data-tone="amarillo">
          Sin confirmación en el último año: todos los reportes aprobados tienen más de 12 meses.
        </p>
      )}
      {summary.regressions.map((r) => (
        <p key={r.edition_id} className="note small" data-tone="rojo">
          <b>Dejó de funcionar</b> en {r.launcher}: la prueba más reciente ({date(r.tested_at)}, versión {r.game_version},{' '}
          {r.layer}) dio «{outcome[r.outcome].text}» después de reportes que funcionaban.
        </p>
      ))}
      {breakdown.length > 0 && (
        <>
          <div className="breakdown" aria-hidden="true">
            {breakdown.map((x) => (
              <span key={x.outcome} data-tone={outcome[x.outcome].tone} data-shape="relleno" style={{ flexGrow: x.n }} />
            ))}
          </div>
          <ul className="breakdown-legend" aria-label="Resultados aprobados">
            {breakdown.map((x) => (
              <li key={x.outcome}>
                <i data-tone={outcome[x.outcome].tone} data-shape="relleno" />
                {x.n} {outcome[x.outcome].text.toLowerCase()}
              </li>
            ))}
          </ul>
        </>
      )}
      {summary.failures.length > 0 && (
        <p className="small">
          Causas observadas: <FailureChips failures={summary.failures} />
        </p>
      )}
      {pending > 0 && (
        <p className="pending">
          {pending === 1
            ? '1 reporte más espera revisión y todavía no cuenta.'
            : `${pending} reportes más esperan revisión y todavía no cuentan.`}
        </p>
      )}
      <p className="small muted">
        El estado se calcula al consultar a partir de los reportes aprobados del último año, o de todos si ninguno es tan
        reciente. Un resultado favorable no garantiza que funcione en cualquier equipo.
      </p>
    </section>
  )
}
