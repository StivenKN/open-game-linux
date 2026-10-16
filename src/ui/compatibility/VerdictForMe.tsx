import type { ReactNode } from 'react'
import type { CompatibilitySummary } from '../../domain/compatibility.ts'
import type { X86Level } from '../../domain/platform.ts'
import type { GamePath } from '../../domain/graphics-path.ts'
import { count, date } from '../format.ts'
import { Badge } from '../Badge.tsx'
import { compatibilityStatus } from '../vocabulary.ts'
import { EvaluationChecklist, type EvaluatedProfile } from './EvaluationChecklist.tsx'
import { GraphicsPath } from './GraphicsPath.tsx'

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
export function VerdictForMe({ personal, children }: { personal: Personal | null; children?: ReactNode }) {
  const mine = personal?.on_my_distribution
  return (
    <MachinePanel>
      {personal === null ? (
        <p className="pequeno tenue">
          Sin diagnóstico. Ejecuta el detector para ver si tu tarjeta gráfica tiene una ruta para este juego, la evidencia
          de tu distribución y cómo te comparas con un perfil aprobado.
        </p>
      ) : (
        <>
          {mine && (
            <p className="fila pequeno">
              <span>En tu distribución, {mine.name}:</span>
              <Badge label={compatibilityStatus[mine.summary.status]} />
              <span className="tenue">
                {mine.summary.last_tested
                  ? `${count(mine.summary.test_count, 'reporte aprobado', 'reportes aprobados')} · última prueba ${date(mine.summary.last_tested)}${mine.summary.no_recent_confirmation ? ' · sin confirmación en el último año' : ''}`
                  : `nadie ha aprobado una prueba en ${mine.name}`}
              </span>
            </p>
          )}
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
