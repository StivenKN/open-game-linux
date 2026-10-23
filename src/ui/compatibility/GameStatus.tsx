import type { ReactNode } from 'react'
import type { CompatibilitySummary } from '../../domain/compatibility.ts'
import { Outcome } from '../../domain/literals.ts'
import { useT } from '../i18n/messages.ts'
import { FailureChips } from './FailureChips.tsx'

/** The game's computed state. `children` goes under its meaning, e.g. the Steam Deck line. */
export function GameStatus({ summary, pending, children }: { summary: CompatibilitySummary; pending: number; children?: ReactNode }) {
  const t = useT()
  const s = t.compatibility.gameStatus
  const label = t.compatibilityStatus[summary.status]
  const base = summary.no_recent_confirmation ? summary.test_count : summary.recent_count
  // The environments the state counts, so the bar adds up to `base`.
  const counted = summary.setups.filter((e) => e.recent_count > 0 || summary.no_recent_confirmation)
  const breakdown = Outcome.literals.flatMap((r) => {
    const n = counted.reduce((total, e) => total + (e.by_outcome[r] ?? 0), 0)
    return n > 0 ? [{ outcome: r, n }] : []
  })
  return (
    <section className="verdict" data-tone={label.tone} aria-label={s.label}>
      <div className="verdict-head">
        <span className="verdict-icon" data-tone={label.tone} data-shape="relleno" data-state={summary.status} aria-hidden="true">
          {label.icon}
        </span>
        <div>
          <p className="verdict-status">{label.text}</p>
          <p className="verdict-base">{summary.last_tested ? s.basis(base, summary.test_count, t.date(summary.last_tested)) : s.noReports}</p>
        </div>
      </div>
      <p className="verdict-meaning">{t.statusMeaning[summary.status]}</p>
      {children}
      {summary.no_recent_confirmation && (
        <p className="note small" data-tone="amarillo">
          {s.noRecent}
        </p>
      )}
      {summary.regressions.map((r) => (
        <p key={r.edition_id} className="note small" data-tone="rojo">
          {s.regression({ launcher: r.launcher, tested: t.date(r.tested_at), version: r.game_version, layer: r.layer, outcome: t.outcome[r.outcome].text })}
        </p>
      ))}
      {breakdown.length > 0 && (
        <>
          <div className="breakdown" aria-hidden="true">
            {breakdown.map((x) => (
              <span key={x.outcome} data-tone={t.outcome[x.outcome].tone} data-shape="relleno" style={{ flexGrow: x.n }} />
            ))}
          </div>
          <ul className="breakdown-legend" aria-label={s.breakdown}>
            {breakdown.map((x) => (
              <li key={x.outcome}>
                <i data-tone={t.outcome[x.outcome].tone} data-shape="relleno" />
                {x.n} {t.outcome[x.outcome].text.toLowerCase()}
              </li>
            ))}
          </ul>
        </>
      )}
      {summary.failures.length > 0 && (
        <p className="small">
          {s.causes} <FailureChips failures={summary.failures} />
        </p>
      )}
      {pending > 0 && <p className="pending">{s.pending(pending)}</p>}
      <p className="small muted">{s.footnote}</p>
    </section>
  )
}
