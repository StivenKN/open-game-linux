import { Link } from '@tanstack/react-router'
import type { CompatibilityStatus } from '../../domain/compatibility.ts'
import type { GameId } from '../../domain/ids.ts'
import type { X86Level } from '../../domain/platform.ts'
import type { GamePath } from '../../domain/graphics-path.ts'
import { EvaluationChecklist, type EvaluatedProfile } from '../compatibility/EvaluationChecklist.tsx'
import { GraphicsPath } from '../compatibility/GraphicsPath.tsx'
import { count } from '../format.ts'
import { Badge } from '../Badge.tsx'
import { compatibilityStatus } from '../vocabulary.ts'

export type MatrixRow = {
  readonly juego_id: GameId
  readonly titulo: string
  readonly in_library: boolean
  readonly status: CompatibilityStatus
  readonly test_count: number
  readonly nivel_x86_min: X86Level | null
  readonly path: GamePath
  readonly profile: (EvaluatedProfile & { readonly capa: string; readonly distribucion: string }) | null
}

/** `approximate`: the capture came from Windows, so every verdict is a projection. */
export function DiagnosticMatrix({ rows, approximate }: { rows: ReadonlyArray<MatrixRow>; approximate: boolean }) {
  return (
    <ul className="mosaico mosaico-ancho" aria-label="Juegos frente a tu equipo">
      {rows.map((f) => (
        <li key={f.juego_id} className="tarjeta pila">
          <h3 className="sin-margen">
            <Link to="/juegos/$gameId" params={{ gameId: f.juego_id }} className="nombre-juego">
              {f.titulo}
            </Link>
          </h3>
          <div className="fila">
            <Badge label={compatibilityStatus[f.status]} />
            <span className="pequeno tenue">{count(f.test_count, 'reporte aprobado', 'reportes aprobados')}</span>
          </div>
          <hr />
          <GraphicsPath path={f.path} minX86Level={f.nivel_x86_min} approximate={approximate} />
          <hr />
          {f.profile && (
            <p className="pequeno tenue dato">
              {f.profile.capa} · {f.profile.distribucion}
            </p>
          )}
          <EvaluationChecklist profile={f.profile} />
        </li>
      ))}
    </ul>
  )
}
