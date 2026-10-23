import { Link } from '@tanstack/react-router'
import type { CompatibilityStatus } from '../../domain/compatibility.ts'
import type { OnlinePlayBlock } from '../../domain/anticheat.ts'
import type { GameId } from '../../domain/ids.ts'
import type { X86Level } from '../../domain/platform.ts'
import type { GamePath } from '../../domain/graphics-path.ts'
import { EvaluationChecklist, type EvaluatedProfile } from '../compatibility/EvaluationChecklist.tsx'
import { GraphicsPath } from '../compatibility/GraphicsPath.tsx'
import { Badge } from '../Badge.tsx'
import { useLang, useT } from '../i18n/messages.ts'

export type MatrixRow = {
  readonly game_id: GameId
  readonly title: string
  readonly in_library: boolean
  readonly status: CompatibilityStatus
  readonly test_count: number
  readonly no_recent_confirmation: boolean
  readonly regressed: boolean
  readonly blocked_by_anti_cheat: boolean
  readonly out_of_reach: boolean
  readonly awacy: OnlinePlayBlock | null
  readonly x86_level_min: X86Level | null
  readonly path: GamePath
  readonly profile: (EvaluatedProfile & { readonly layer: string; readonly distribution: string }) | null
}

/** `approximate`: the capture came from Windows, so every verdict is a projection. */
export function DiagnosticMatrix({ rows, approximate }: { rows: ReadonlyArray<MatrixRow>; approximate: boolean }) {
  const t = useT()
  const lang = useLang()
  return (
    <ul className="mosaic mosaic-wide" aria-label={t.diagnosis.matrix.label}>
      {rows.map((f) => (
        <li key={f.game_id} className="card stack">
          <h3 className="no-margin">
            <Link to="/$lang/juegos/$gameId" params={{ lang, gameId: f.game_id }} className="game-name">
              {f.title}
            </Link>
          </h3>
          <div className="row">
            <Badge label={t.compatibilityStatus[f.status]} />
            <span className="small muted">{t.approvedReports(f.test_count)}</span>
          </div>
          <hr />
          <GraphicsPath path={f.path} minX86Level={f.x86_level_min} approximate={approximate} />
          <hr />
          {f.profile && (
            <p className="small muted datum">
              {f.profile.layer} · {f.profile.distribution}
            </p>
          )}
          <EvaluationChecklist profile={f.profile} />
        </li>
      ))}
    </ul>
  )
}
