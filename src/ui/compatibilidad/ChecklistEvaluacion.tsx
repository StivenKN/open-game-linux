// The hardware evaluation against one approved profile: dashed badge, one row per condition the
// profile states, and one sentence of why. It compares RAM, VRAM and Vulkan; it never predicts FPS.
import type { Comprobacion, Evaluacion } from '../../dominio/evaluacion.ts'
import { memoria } from '../formato.ts'
import { Insignia } from '../Insignia.tsx'
import { estadoComprobacion, requisito, veredictoRequisitos } from '../vocabulario.ts'

/** An approved profile already evaluated against the viewer's diagnosis. */
export type PerfilEvaluado = { readonly titulo: string; readonly revision: number; readonly evaluacion: Evaluacion }

/** Comprobacion carries raw values ("8192" MB, "1.3"); the UI owns units. */
const valor = (c: Comprobacion, v: string) => (c.requisito === 'vulkan' ? v : memoria(Number(v)))

const motivo = (e: Evaluacion): string => {
  switch (e.veredicto) {
    case 'no_cumple': {
      const c = e.comprobaciones.find((x) => x.estado === 'no_cumple')
      if (!c) return 'Tu equipo no cumple una condición del perfil.'
      return c.detectado === null
        ? `${requisito[c.requisito]}: el perfil exige ${valor(c, c.exigido)} y tu equipo no lo ofrece.`
        : `${requisito[c.requisito]}: tienes ${valor(c, c.detectado)}, el perfil exige ${valor(c, c.exigido)}.`
    }
    case 'informacion_insuficiente': {
      const c = e.comprobaciones.find((x) => x.estado === 'desconocido')
      return c
        ? `No conocemos tu ${requisito[c.requisito]}; el perfil exige ${valor(c, c.exigido)}.`
        : 'El perfil no declara condiciones de RAM, VRAM ni Vulkan.'
    }
    case 'cumple':
      return `Superas las comprobaciones disponibles (${e.comprobaciones.map((c) => requisito[c.requisito]).join(', ')}). Esto no predice FPS.`
  }
}

/** `perfil` null: the game has no approved profile with known conditions, so nothing can be compared. */
export function ChecklistEvaluacion({ perfil }: { perfil: PerfilEvaluado | null }) {
  const evaluacion = perfil?.evaluacion
  return (
    <div className="pila">
      <div className="fila">
        <Insignia etiqueta={veredictoRequisitos[evaluacion?.veredicto ?? 'informacion_insuficiente']} forma="punteado" />
        <span className="dato">{perfil ? `perfil ${perfil.titulo} r${perfil.revision}` : 'sin perfil aprobado'}</span>
      </div>
      {evaluacion && evaluacion.comprobaciones.length > 0 && (
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
            {evaluacion.comprobaciones.map((c) => {
              const estado = estadoComprobacion[c.estado]
              return (
                <tr key={c.requisito}>
                  <th scope="row">{requisito[c.requisito]}</th>
                  <td>{c.detectado === null ? 'desconocido' : valor(c, c.detectado)}</td>
                  <td>{valor(c, c.exigido)}</td>
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
      {evaluacion?.solo_orientativa && (
        <p className="pequeno nota" data-tono="azul">
          Diagnóstico hecho en Windows: sirve de orientación, no prueba que funcione en Linux.
        </p>
      )}
    </div>
  )
}
