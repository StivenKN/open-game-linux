import type { FailureCount } from '../../domain/compatibility.ts'
import { Chip } from '../Badge.tsx'
import { useT } from '../i18n/messages.ts'

export function FailureChips({ failures }: { failures: ReadonlyArray<FailureCount> }) {
  const t = useT()
  return (
    <span className="chip-row">
      {failures.map((f) => {
        const label = t.failureType(f.code)
        return (
          <span key={f.code} title={t.reports(f.reports)}>
            <Chip tone={label.tone}>{label.text}</Chip>
          </span>
        )
      })}
    </span>
  )
}
