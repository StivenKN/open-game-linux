import type { LayerHistory } from '../../domain/compatibility.ts'
import { Badge } from '../Badge.tsx'
import { useT } from '../i18n/messages.ts'

/** The game page's history by version: one step per layer version, in the order each was first tested. */
export function LayerTimeline({ history }: { history: ReadonlyArray<LayerHistory> }) {
  const t = useT()
  const m = t.compatibility.timeline
  return (
    <ol className="timeline card" aria-label={m.label}>
      {history.map((h) => {
        const status = t.compatibilityStatus[h.status]
        return (
          <li key={h.layer_version_id} className="timeline-step">
            <span className="timeline-dot" data-tone={status.tone} data-shape="relleno" data-state={h.status} aria-hidden="true" />
            <div className="timeline-what">
              <h3>{h.layer}</h3>
              <p className="small muted">
                {m.span(t.date(h.first_tested), t.date(h.last_tested))} · {t.approvedReports(h.test_count)}
              </p>
              {h.regressions.map((r) => (
                <p key={r.edition_id} className="note small" data-tone="rojo">
                  {m.regression(r.launcher, t.date(r.tested_at))}
                </p>
              ))}
            </div>
            <Badge label={status} />
          </li>
        )
      })}
    </ol>
  )
}
