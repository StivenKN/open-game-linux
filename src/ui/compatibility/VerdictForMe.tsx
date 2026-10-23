import type { ReactNode } from 'react'
import type { CompatibilitySummary } from '../../domain/compatibility.ts'
import type { X86Level } from '../../domain/platform.ts'
import type { GamePath } from '../../domain/graphics-path.ts'
import { EvaluationChecklist, type EvaluatedProfile } from './EvaluationChecklist.tsx'
import { GraphicsPath } from './GraphicsPath.tsx'
import { ScopedStatus } from './ScopedStatus.tsx'

export type Personal = {
  readonly on_my_distribution: { readonly name: string; readonly summary: CompatibilitySummary } | null
  readonly profile: EvaluatedProfile | null
  readonly path: GamePath
  readonly x86_level_min: X86Level | null
  readonly approximate: boolean
}

/** The dashed "Tu equipo" panel: everything in it is computed from the visitor's hardware. */
export function MachinePanel({ children }: { children: ReactNode }) {
  return (
    <section className="machine-panel" aria-label="Tu equipo">
      <p className="panel-title">Tu equipo</p>
      {children}
      <ul className="shape-key" aria-label="Cómo leer las etiquetas">
        <li>
          <i data-shape="relleno" />
          Relleno: lo dicen los reportes aprobados
        </li>
        <li>
          <i data-shape="punteado" />
          Punteado: lo calcula tu equipo
        </li>
      </ul>
    </section>
  )
}

/** The game page's panel. `children` goes under the evaluation, e.g. which diagnosis it compared. */
export function VerdictForMe({ personal, children }: { personal: Personal | null; children?: ReactNode }) {
  const mine = personal?.on_my_distribution
  return (
    <MachinePanel>
      {personal === null ? (
        <p className="small muted">
          Sin diagnóstico. Ejecuta el detector para ver si tu tarjeta gráfica tiene una ruta para este juego, la evidencia
          de tu distribución y cómo te comparas con un perfil aprobado.
        </p>
      ) : (
        <>
          {mine && <ScopedStatus label={`En tu distribución, ${mine.name}:`} summary={mine.summary} none={`nadie ha aprobado una prueba en ${mine.name}`} />}
          <hr />
          <GraphicsPath path={personal.path} minX86Level={personal.x86_level_min} approximate={personal.approximate} />
          <hr />
          <EvaluationChecklist profile={personal.profile} />
        </>
      )}
      {children}
    </MachinePanel>
  )
}
