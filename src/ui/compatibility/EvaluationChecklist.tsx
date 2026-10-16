import type { RequirementCheck, Evaluation } from '../../domain/evaluation.ts'
import { memoria } from '../format.ts'
import { Insignia } from '../Badge.tsx'
import { estadoComprobacion, origenVulkan, requisito, veredictoRequisitos } from '../vocabulary.ts'

export type PerfilEvaluado = { readonly titulo: string; readonly revision: number; readonly evaluacion: Evaluation }

const valor = (c: RequirementCheck, v: string) => (c.requirement === 'vulkan' ? v : memoria(Number(v)))

const motivo = (e: Evaluation): string => {
  switch (e.verdict) {
    case 'no_cumple': {
      const c = e.checks.find((x) => x.status === 'no_cumple')
      if (!c) return 'Tu equipo no cumple una condición del perfil.'
      if (c.detected === null) return `${requisito[c.requirement]}: el perfil exige ${valor(c, c.required)} y tu equipo no lo ofrece.`
      return c.detected.origin === 'proyectado'
        ? `${requisito[c.requirement]}: en Linux tu tarjeta gráfica llegaría a ${valor(c, c.detected.value)}, el perfil exige ${valor(c, c.required)}.`
        : `${requisito[c.requirement]}: tienes ${valor(c, c.detected.value)}, el perfil exige ${valor(c, c.required)}.`
    }
    case 'informacion_insuficiente': {
      const c = e.checks.find((x) => x.status === 'desconocido')
      if (c?.detected?.origin === 'proyectado')
        return `${requisito[c.requirement]}: en Linux tu tarjeta gráfica llegaría a ${valor(c, c.detected.value)}; no sabemos si alcanza ${valor(c, c.required)}.`
      return c
        ? `No conocemos tu ${requisito[c.requirement]}; el perfil exige ${valor(c, c.required)}.`
        : 'El perfil no declara condiciones de RAM, VRAM ni Vulkan.'
    }
    case 'cumple':
      return `Superas las comprobaciones disponibles (${e.checks.map((c) => requisito[c.requirement]).join(', ')}). Esto no predice FPS.`
  }
}

export function ChecklistEvaluacion({ perfil }: { perfil: PerfilEvaluado | null }) {
  const evaluacion = perfil?.evaluacion
  return (
    <div className="pila">
      <div className="fila">
        <Insignia etiqueta={veredictoRequisitos[evaluacion?.verdict ?? 'informacion_insuficiente']} forma="punteado" />
        <span className="dato">{perfil ? `perfil ${perfil.titulo} r${perfil.revision}` : 'sin perfil aprobado'}</span>
      </div>
      {evaluacion && evaluacion.checks.length > 0 && (
        <table className="checklist">
          <caption className="solo-lector">Tu equipo frente al perfil</caption>
          <thead>
            <tr>
              <th scope="col">Dato</th>
              <th scope="col">Tu equipo</th>
              <th scope="col">Mínimo conocido</th>
              <th scope="col"><span className="solo-lector">Resultado</span></th>
            </tr>
          </thead>
          <tbody>
            {evaluacion.checks.map((c) => {
              const estado = estadoComprobacion[c.status]
              return (
                <tr key={c.requirement}>
                  <th scope="row">{requisito[c.requirement]}</th>
                  <td>
                    {c.detected === null ? 'desconocido' : valor(c, c.detected.value)}
                    {c.requirement === 'vulkan' && c.detected !== null && <span className="pequeno"> · {origenVulkan[c.detected.origin]}</span>}
                  </td>
                  <td>{valor(c, c.required)}</td>
                  <td data-tono={estado.tono}>
                    <span aria-hidden="true">{estado.icono}</span>
                    <span className="solo-lector">{estado.texto}</span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
      <p className="pequeno tenue">{evaluacion ? motivo(evaluacion) : 'No hay un perfil aprobado con condiciones conocidas.'}</p>
      {evaluacion?.advisory_only && (
        <p className="pequeno nota" data-tono="azul">
          Diagnóstico hecho en Windows: Vulkan es una proyección para Linux según tu tarjeta gráfica; sirve de orientación.
        </p>
      )}
    </div>
  )
}
