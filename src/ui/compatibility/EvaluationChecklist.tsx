import type { RequirementCheck, Evaluation } from '../../domain/evaluation.ts'
import { memory } from '../format.ts'
import { Badge } from '../Badge.tsx'
import { checkStatus, vulkanOrigin, requirement, requirementsVerdict } from '../vocabulary.ts'

export type EvaluatedProfile = { readonly title: string; readonly revision: number; readonly evaluation: Evaluation }

const displayValue = (c: RequirementCheck, v: string) => (c.requirement === 'vulkan' ? v : memory(Number(v)))

const reason = (e: Evaluation): string => {
  switch (e.verdict) {
    case 'no_cumple': {
      const c = e.checks.find((x) => x.status === 'no_cumple')
      if (!c) return 'Tu equipo no cumple una condición del perfil.'
      if (c.detected === null) return `${requirement[c.requirement]}: el perfil exige ${displayValue(c, c.required)} y tu equipo no lo ofrece.`
      return c.detected.origin === 'proyectado'
        ? `${requirement[c.requirement]}: en Linux tu tarjeta gráfica llegaría a ${displayValue(c, c.detected.value)}, el perfil exige ${displayValue(c, c.required)}.`
        : `${requirement[c.requirement]}: tienes ${displayValue(c, c.detected.value)}, el perfil exige ${displayValue(c, c.required)}.`
    }
    case 'informacion_insuficiente': {
      const c = e.checks.find((x) => x.status === 'desconocido')
      if (c?.detected?.origin === 'proyectado')
        return `${requirement[c.requirement]}: en Linux tu tarjeta gráfica llegaría a ${displayValue(c, c.detected.value)}; no sabemos si alcanza ${displayValue(c, c.required)}.`
      return c
        ? `No conocemos tu ${requirement[c.requirement]}; el perfil exige ${displayValue(c, c.required)}.`
        : 'El perfil no declara condiciones de RAM, VRAM ni Vulkan.'
    }
    case 'cumple':
      return `Superas las comprobaciones disponibles (${e.checks.map((c) => requirement[c.requirement]).join(', ')}). Esto no predice FPS.`
  }
}

export function EvaluationChecklist({ profile }: { profile: EvaluatedProfile | null }) {
  const evaluation = profile?.evaluation
  return (
    <div className="stack">
      <div className="row">
        <Badge label={requirementsVerdict[evaluation?.verdict ?? 'informacion_insuficiente']} shape="punteado" />
        <span className="datum">{profile ? `perfil ${profile.title} r${profile.revision}` : 'sin perfil aprobado'}</span>
      </div>
      {evaluation && evaluation.checks.length > 0 && (
        <table className="checklist">
          <caption className="sr-only">Tu equipo frente al perfil</caption>
          <thead>
            <tr>
              <th scope="col">Dato</th>
              <th scope="col">Tu equipo</th>
              <th scope="col">Mínimo conocido</th>
              <th scope="col"><span className="sr-only">Resultado</span></th>
            </tr>
          </thead>
          <tbody>
            {evaluation.checks.map((c) => {
              const status = checkStatus[c.status]
              return (
                <tr key={c.requirement}>
                  <th scope="row">{requirement[c.requirement]}</th>
                  <td>
                    {c.detected === null ? 'desconocido' : displayValue(c, c.detected.value)}
                    {c.requirement === 'vulkan' && c.detected !== null && <span className="small"> · {vulkanOrigin[c.detected.origin]}</span>}
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
      <p className="small muted">{evaluation ? reason(evaluation) : 'No hay un perfil aprobado con condiciones conocidas.'}</p>
      {evaluation?.advisory_only && (
        <p className="small note" data-tone="azul">
          Diagnóstico hecho en Windows: Vulkan es una proyección para Linux según tu tarjeta gráfica; sirve de orientación.
        </p>
      )}
    </div>
  )
}
