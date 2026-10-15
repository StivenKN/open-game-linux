import { Link } from '@tanstack/react-router'
import type { EstadoCompatibilidad } from '../../dominio/compatibilidad.ts'
import type { JuegoId } from '../../dominio/ids.ts'
import { ChecklistEvaluacion, type PerfilEvaluado } from '../compatibilidad/ChecklistEvaluacion.tsx'
import { contar } from '../formato.ts'
import { Insignia } from '../Insignia.tsx'
import { estadoCompatibilidad } from '../vocabulario.ts'

export type FilaMatriz = {
  readonly juego_id: JuegoId
  readonly titulo: string
  readonly en_biblioteca: boolean
  readonly estado: EstadoCompatibilidad
  readonly pruebas: number
  readonly perfil: (PerfilEvaluado & { readonly capa: string; readonly distribucion: string }) | null
}

export function MatrizDiagnostico({ filas }: { filas: ReadonlyArray<FilaMatriz> }) {
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
