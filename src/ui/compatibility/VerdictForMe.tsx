import type { ReactNode } from 'react'
import type { ResumenCompatibilidad } from '../../domain/compatibility.ts'
import type { NivelX86 } from '../../domain/platform.ts'
import type { RutaJuego } from '../../domain/graphics-path.ts'
import { contar, fecha } from '../format.ts'
import { Insignia } from '../Badge.tsx'
import { estadoCompatibilidad } from '../vocabulary.ts'
import { ChecklistEvaluacion, type PerfilEvaluado } from './EvaluationChecklist.tsx'
import { RutaGrafica } from './GraphicsPath.tsx'

export type Personal = {
  readonly en_mi_distribucion: { readonly nombre: string; readonly resumen: ResumenCompatibilidad } | null
  readonly perfil: PerfilEvaluado | null
  readonly ruta: RutaJuego
  readonly nivel_x86_min: NivelX86 | null
  readonly orientativa: boolean
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
          Sin diagnóstico. Ejecuta el detector para ver si tu tarjeta gráfica tiene una ruta para este juego, la evidencia
          de tu distribución y cómo te comparas con un perfil aprobado.
        </p>
      ) : (
        <>
          {mia && (
            <p className="fila pequeno">
              <span>En tu distribución, {mia.nombre}:</span>
              <Insignia etiqueta={estadoCompatibilidad[mia.resumen.estado]} />
              <span className="tenue">
                {mia.resumen.ultima_prueba
                  ? `${contar(mia.resumen.pruebas, 'reporte aprobado', 'reportes aprobados')} · última prueba ${fecha(mia.resumen.ultima_prueba)}${mia.resumen.sin_confirmacion_reciente ? ' · sin confirmación en el último año' : ''}`
                  : `nadie ha aprobado una prueba en ${mia.nombre}`}
              </span>
            </p>
          )}
          <hr />
          <RutaGrafica ruta={personal.ruta} minimo={personal.nivel_x86_min} orientativa={personal.orientativa} />
          <hr />
          <ChecklistEvaluacion perfil={personal.perfil} />
        </>
      )}
      {children}
    </PanelEquipo>
  )
}
