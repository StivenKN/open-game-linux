import type { FailureCount } from '../../domain/compatibility.ts'
import { count } from '../format.ts'
import { Chip } from '../Badge.tsx'
import { failureType } from '../vocabulary.ts'

export function FailureChips({ failures }: { failures: ReadonlyArray<FailureCount> }) {
  return (
    <span className="chip-row">
      {failures.map((f) => {
        const label = failureType(f.code)
        return (
          <span key={f.code} title={count(f.reports, 'reporte', 'reportes')}>
            <Chip tone={label.tone}>{label.text}</Chip>
          </span>
        )
      })}
    </span>
  )
}
