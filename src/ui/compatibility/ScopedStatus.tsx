import type { CompatibilitySummary } from '../../domain/compatibility.ts'
import { count, date } from '../format.ts'
import { Badge } from '../Badge.tsx'
import { compatibilityStatus } from '../vocabulary.ts'

/** The state of a slice of the approved reports, on one line: "En tu distribución, Fedora 40:", "En Steam Deck:". */
export function ScopedStatus({ label, summary, none }: { label: string; summary: CompatibilitySummary; none: string }) {
  return (
    <p className="row small">
      <span>{label}</span>
      <Badge label={compatibilityStatus[summary.status]} />
      <span className="muted">
        {summary.last_tested
          ? `${count(summary.test_count, 'reporte aprobado', 'reportes aprobados')} · última prueba ${date(summary.last_tested)}${summary.no_recent_confirmation ? ' · sin confirmación en el último año' : ''}`
          : none}
      </span>
    </p>
  )
}
