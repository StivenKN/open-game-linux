import type { RequirementCheck, Evaluation } from '../../domain/evaluation.ts'
import { memory } from '../format.ts'
import { Badge } from '../Badge.tsx'
import type { Messages } from '../i18n/es.ts'
import { useT } from '../i18n/messages.ts'
import { requirement } from '../vocabulary.ts'

export type EvaluatedProfile = { readonly title: string; readonly revision: number; readonly evaluation: Evaluation }

const displayValue = (c: RequirementCheck, v: string) => (c.requirement === 'vulkan' ? v : memory(Number(v)))

const reason = (t: Messages, e: Evaluation): string => {
  const r = t.compatibility.checklist.reason
  switch (e.verdict) {
    case 'no_cumple': {
      const c = e.checks.find((x) => x.status === 'no_cumple')
      if (!c) return r.fails
      if (c.detected === null) return r.missing(requirement[c.requirement], displayValue(c, c.required))
      return c.detected.origin === 'proyectado'
        ? r.projectedBelow(requirement[c.requirement], displayValue(c, c.detected.value), displayValue(c, c.required))
        : r.below(requirement[c.requirement], displayValue(c, c.detected.value), displayValue(c, c.required))
    }
    case 'informacion_insuficiente': {
      const c = e.checks.find((x) => x.status === 'desconocido')
      if (c?.detected?.origin === 'proyectado')
        return r.projectedUnknown(requirement[c.requirement], displayValue(c, c.detected.value), displayValue(c, c.required))
      return c ? r.unknown(requirement[c.requirement], displayValue(c, c.required)) : r.noConditions
    }
    case 'cumple':
      return r.meets(e.checks.map((c) => requirement[c.requirement]).join(', '))
  }
}

export function EvaluationChecklist({ profile }: { profile: EvaluatedProfile | null }) {
  const t = useT()
  const m = t.compatibility.checklist
  const evaluation = profile?.evaluation
  return (
    <div className="stack">
      <div className="row">
        <Badge label={t.requirementsVerdict[evaluation?.verdict ?? 'informacion_insuficiente']} shape="punteado" />
        <span className="datum">{profile ? m.profile(profile.title, profile.revision) : m.noApprovedProfile}</span>
      </div>
      {evaluation && evaluation.checks.length > 0 && (
        <table className="checklist">
          <caption className="sr-only">{m.caption}</caption>
          <thead>
            <tr>
              <th scope="col">{m.requirement}</th>
              <th scope="col">{m.yours}</th>
              <th scope="col">{m.minimum}</th>
              <th scope="col"><span className="sr-only">{m.result}</span></th>
            </tr>
          </thead>
          <tbody>
            {evaluation.checks.map((c) => {
              const status = t.checkStatus[c.status]
              return (
                <tr key={c.requirement}>
                  <th scope="row">{requirement[c.requirement]}</th>
                  <td>
                    {c.detected === null ? m.unknown : displayValue(c, c.detected.value)}
                    {c.requirement === 'vulkan' && c.detected !== null && <span className="small"> · {t.vulkanOrigin[c.detected.origin]}</span>}
                  </td>
                  <td>{displayValue(c, c.required)}</td>
                  <td data-tone={status.tone}>
                    <span aria-hidden="true">{status.icon}</span>
                    <span className="sr-only">{status.text}</span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
      <p className="small muted">{evaluation ? reason(t, evaluation) : m.noProfile}</p>
      {evaluation?.advisory_only && (
        <p className="small note" data-tone="azul">
          {m.windows}
        </p>
      )}
    </div>
  )
}
