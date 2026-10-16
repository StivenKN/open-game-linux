import { Link } from '@tanstack/react-router'
import type { EstadoCompatibilidad } from '../../domain/compatibility.ts'
import type { JuegoId } from '../../domain/ids.ts'
import type { NivelX86 } from '../../domain/platform.ts'
import type { RutaJuego } from '../../domain/graphics-path.ts'
import { ChecklistEvaluacion, type PerfilEvaluado } from '../compatibility/EvaluationChecklist.tsx'
import { RutaGrafica } from '../compatibility/GraphicsPath.tsx'
import { contar } from '../format.ts'
import { Insignia } from '../Badge.tsx'
import { estadoCompatibilidad } from '../vocabulary.ts'

export type FilaMatriz = {
  readonly juego_id: JuegoId
  readonly titulo: string
  readonly en_biblioteca: boolean
  readonly estado: EstadoCompatibilidad
  readonly pruebas: number
  readonly nivel_x86_min: NivelX86 | null
  readonly ruta: RutaJuego
  readonly perfil: (PerfilEvaluado & { readonly capa: string; readonly distribucion: string }) | null
}

/** `orientativa`: the capture came from Windows, so every verdict is a projection. */
export function MatrizDiagnostico({ filas, orientativa }: { filas: ReadonlyArray<FilaMatriz>; orientativa: boolean }) {
  return (
    <ul className="mosaico mosaico-ancho" aria-label="Juegos frente a tu equipo">
      {filas.map((f) => (
        <li key={f.juego_id} className="tarjeta pila">
          <h3 className="sin-margen">
            <Link to="/juegos/$juegoId" params={{ juegoId: f.juego_id }} className="nombre-juego">
              {f.titulo}
            </Link>
          </h3>
          <div className="fila">
            <Insignia etiqueta={estadoCompatibilidad[f.estado]} />
            <span className="pequeno tenue">{contar(f.pruebas, 'reporte aprobado', 'reportes aprobados')}</span>
          </div>
          <hr />
          <RutaGrafica ruta={f.ruta} minimo={f.nivel_x86_min} orientativa={orientativa} />
          <hr />
          {f.perfil && (
            <p className="pequeno tenue dato">
              {f.perfil.capa} · {f.perfil.distribucion}
            </p>
          )}
          <ChecklistEvaluacion perfil={f.perfil} />
        </li>
      ))}
    </ul>
  )
}
