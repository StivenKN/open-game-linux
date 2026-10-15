import type { Comprobacion, Evaluacion } from '../../dominio/evaluacion.ts'
import { memoria } from '../formato.ts'
import { Insignia } from '../Insignia.tsx'
import { estadoComprobacion, origenVulkan, requisito, veredictoRequisitos } from '../vocabulario.ts'

export type PerfilEvaluado = { readonly titulo: string; readonly revision: number; readonly evaluacion: Evaluacion }

const valor = (c: Comprobacion, v: string) => (c.requisito === 'vulkan' ? v : memoria(Number(v)))

const motivo = (e: Evaluacion): string => {
  switch (e.veredicto) {
    case 'no_cumple': {
      const c = e.comprobaciones.find((x) => x.estado === 'no_cumple')
      if (!c) return 'Tu equipo no cumple una condición del perfil.'
      if (c.detectado === null) return `${requisito[c.requisito]}: el perfil exige ${valor(c, c.exigido)} y tu equipo no lo ofrece.`
      return c.detectado.origen === 'proyectado'
        ? `${requisito[c.requisito]}: en Linux tu tarjeta gráfica llegaría a ${valor(c, c.detectado.valor)}, el perfil exige ${valor(c, c.exigido)}.`
        : `${requisito[c.requisito]}: tienes ${valor(c, c.detectado.valor)}, el perfil exige ${valor(c, c.exigido)}.`
    }
    case 'informacion_insuficiente': {
      const c = e.comprobaciones.find((x) => x.estado === 'desconocido')
      if (c?.detectado?.origen === 'proyectado')
        return `${requisito[c.requisito]}: en Linux tu tarjeta gráfica llegaría a ${valor(c, c.detectado.valor)}; no sabemos si alcanza ${valor(c, c.exigido)}.`
      return c
        ? `No conocemos tu ${requisito[c.requisito]}; el perfil exige ${valor(c, c.exigido)}.`
        : 'El perfil no declara condiciones de RAM, VRAM ni Vulkan.'
    }
    case 'cumple':
      return `Superas las comprobaciones disponibles (${e.comprobaciones.map((c) => requisito[c.requisito]).join(', ')}). Esto no predice FPS.`
  }
}

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
                  <td>
                    {c.detectado === null ? 'desconocido' : valor(c, c.detectado.valor)}
                    {c.requisito === 'vulkan' && c.detectado !== null && <span className="pequeno"> · {origenVulkan[c.detectado.origen]}</span>}
                  </td>
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
          Diagnóstico hecho en Windows: Vulkan es una proyección para Linux según tu tarjeta gráfica; sirve de orientación.
        </p>
      )}
    </div>
  )
}
