import type { ReactNode } from 'react'
import type { CompatibilitySummary } from '../../domain/compatibility.ts'
import type { X86Level } from '../../domain/platform.ts'
import type { GamePath } from '../../domain/graphics-path.ts'
import { useT } from '../i18n/messages.ts'
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

/** The dashed "your machine" panel: everything in it is computed from the visitor's hardware. */
export function MachinePanel({ children }: { children: ReactNode }) {
  const m = useT().compatibility.machine
  return (
    <section className="machine-panel" aria-label={m.title}>
      <p className="panel-title">{m.title}</p>
      {children}
      <ul className="shape-key" aria-label={m.shapeKey}>
        <li>
          <i data-shape="relleno" />
          {m.filled}
        </li>
        <li>
          <i data-shape="punteado" />
          {m.dashed}
        </li>
      </ul>
    </section>
  )
}

/** The game page's panel. `children` goes under the evaluation, e.g. which diagnosis it compared. */
export function VerdictForMe({ personal, children }: { personal: Personal | null; children?: ReactNode }) {
  const m = useT().compatibility.machine
  const mine = personal?.on_my_distribution
  return (
    <MachinePanel>
      {personal === null ? (
        <p className="small muted">{m.noDiagnosis}</p>
      ) : (
        <>
          {mine && <ScopedStatus label={m.onMyDistribution(mine.name)} summary={mine.summary} none={m.noneOnMyDistribution(mine.name)} />}
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
