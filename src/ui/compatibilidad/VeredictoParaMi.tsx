import type { ReactNode } from 'react'
import type { ResumenCompatibilidad } from '../../dominio/compatibilidad.ts'
import { contar, fecha } from '../formato.ts'
import { Insignia } from '../Insignia.tsx'
import { estadoCompatibilidad } from '../vocabulario.ts'
import { ChecklistEvaluacion, type PerfilEvaluado } from './ChecklistEvaluacion.tsx'

export type Personal = {
  readonly en_mi_distribucion: { readonly nombre: string; readonly resumen: ResumenCompatibilidad } | null
  readonly perfil: PerfilEvaluado | null
}

/** The dashed "Tu equipo" panel: everything in it is computed from the visitor's hardware. */
export function PanelEquipo({ children }: { children: ReactNode }) {
  return (
    <section className="panel-equipo" aria-label="Tu equipo">
      <p className="panel-titulo">Tu equipo</p>
      {children}
      <ul className="clave-formas" aria-label="Cómo leer las etiquetas">
        <li>
          <i data-forma="relleno" />
          Relleno: lo dicen los reportes aprobados
        </li>
        <li>
          <i data-forma="punteado" />
          Punteado: lo calcula tu equipo
        </li>
      </ul>
    </section>
  )
}

/** The game page's panel. `children` goes under the evaluation, e.g. which diagnosis it compared. */
export function VeredictoParaMi({ personal, children }: { personal: Personal | null; children?: ReactNode }) {
  const mia = personal?.en_mi_distribucion
  return (
    <PanelEquipo>
      {personal === null ? (
        <p className="pequeno tenue">
          Sin diagnóstico. Ejecuta el detector para ver la evidencia de tu distribución y comparar RAM, VRAM y Vulkan con
          un perfil aprobado.
        </p>
      ) : (
        <>
          {mia && (
            <p className="fila pequeno">
              <span>En tu distribución, {mia.nombre}:</span>
              <Insignia etiqueta={estadoCompatibilidad[mia.resumen.estado]} />
              <span className="tenue">
                {mia.resumen.ultima_prueba
                  ? `${contar(mia.resumen.pruebas, 'reporte aprobado', 'reportes aprobados')} · última prueba ${fecha(mia.resumen.ultima_prueba)}`
                  : `nadie ha aprobado una prueba en ${mia.nombre}`}
              </span>
            </p>
          )}
          <ChecklistEvaluacion perfil={personal.perfil} />
        </>
      )}
      {children}
    </PanelEquipo>
  )
}
