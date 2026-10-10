// The viewer's own verdict: variant 2's "En tu distribución" line over the same summary the badge
// uses (enDistribucion), then the hardware evaluation as a separate dashed badge.
import type { ResumenCompatibilidad } from '../../dominio/compatibilidad.ts'
import { contar, fecha } from '../formato.ts'
import { Insignia } from '../Insignia.tsx'
import { estadoCompatibilidad } from '../vocabulario.ts'
import { ChecklistEvaluacion, type PerfilEvaluado } from './ChecklistEvaluacion.tsx'

/**
 * What the ficha knows about the viewer. null = no diagnosis (guest or never ran the detector).
 * `en_mi_distribucion` null = the diagnosis has no distribution (a Windows capture).
 * `perfil` null = no approved profile to evaluate against.
 */
export type Personal = {
  readonly en_mi_distribucion: { readonly nombre: string; readonly resumen: ResumenCompatibilidad } | null
  readonly perfil: PerfilEvaluado | null
}

export function VeredictoParaMi({ personal }: { personal: Personal | null }) {
  if (!personal) {
    return (
      <section className="pila" aria-label="Tu veredicto">
        <div className="rotulo">Tu equipo</div>
        <p className="pequeno tenue">
          Sin diagnóstico. Ejecuta el detector para ver la evidencia de tu distribución y comparar RAM, VRAM y Vulkan con
          un perfil aprobado.
        </p>
      </section>
    )
  }
  const mia = personal.en_mi_distribucion
  return (
    <section className="pila" aria-label="Tu veredicto">
      {mia && (
        <p className="fila pequeno">
          <span>En tu distribución ({mia.nombre}):</span>
          <Insignia etiqueta={estadoCompatibilidad[mia.resumen.estado]} />
          <span className="tenue">
            {mia.resumen.ultima_prueba
              ? `${contar(mia.resumen.pruebas, 'reporte aprobado', 'reportes aprobados')} · última prueba ${fecha(mia.resumen.ultima_prueba)}`
              : `nadie ha aprobado una prueba en ${mia.nombre}`}
          </span>
        </p>
      )}
      <div className="rotulo">Tu equipo</div>
      <ChecklistEvaluacion perfil={personal.perfil} />
    </section>
  )
}
