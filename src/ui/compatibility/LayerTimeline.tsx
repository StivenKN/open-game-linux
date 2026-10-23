import type { LayerHistory } from '../../domain/compatibility.ts'
import { Badge } from '../Badge.tsx'
import { count, date } from '../format.ts'
import { compatibilityStatus } from '../vocabulary.ts'

const span = (h: LayerHistory) =>
  date(h.first_tested) === date(h.last_tested) ? `El ${date(h.first_tested)}` : `Del ${date(h.first_tested)} al ${date(h.last_tested)}`

/** The game page's "Historial por versión": one step per layer version, in the order each was first tested. */
export function LayerTimeline({ history }: { history: ReadonlyArray<LayerHistory> }) {
  return (
    <ol className="timeline card" aria-label="Resultados aprobados por versión, de la primera probada a la última">
      {history.map((h) => {
        const status = compatibilityStatus[h.status]
        return (
          <li key={h.layer_version_id} className="timeline-step">
            <span className="timeline-dot" data-tone={status.tone} data-shape="relleno" data-state={h.status} aria-hidden="true" />
            <div className="timeline-what">
              <h3>{h.layer}</h3>
              <p className="small muted">
                {span(h)} · {count(h.test_count, 'reporte aprobado', 'reportes aprobados')}
              </p>
              {h.regressions.map((r) => (
                <p key={r.edition_id} className="note small" data-tone="rojo">
                  <b>Dejó de funcionar</b> con esta versión en {r.launcher}, el {date(r.tested_at)}.
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
