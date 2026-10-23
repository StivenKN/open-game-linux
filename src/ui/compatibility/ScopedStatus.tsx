import type { CompatibilitySummary } from '../../domain/compatibility.ts'
import { Badge } from '../Badge.tsx'
import { useT } from '../i18n/messages.ts'

/** The state of a slice of the approved reports, on one line: on your distribution, on Steam Deck. */
export function ScopedStatus({ label, summary, none }: { label: string; summary: CompatibilitySummary; none: string }) {
  const t = useT()
  return (
    <p className="row small">
      <span>{label}</span>
      <Badge label={t.compatibilityStatus[summary.status]} />
      <span className="muted">
        {summary.last_tested ? t.compatibility.scoped(summary.test_count, t.date(summary.last_tested), summary.no_recent_confirmation) : none}
      </span>
    </p>
  )
}
