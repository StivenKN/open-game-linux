import type { X86Level } from '../../domain/platform.ts'
import type { GamePath } from '../../domain/graphics-path.ts'
import { Badge } from '../Badge.tsx'
import { useT } from '../i18n/messages.ts'

/**
 * The hardware-only graphics path for one game. It stands apart from the community state and the
 * profile check: it needs no reports.
 */
export function GraphicsPath({ path, minX86Level, approximate }: { path: GamePath; minX86Level: X86Level | null; approximate: boolean }) {
  const t = useT()
  const m = t.compatibility.graphicsPath
  // The warning and launch option follow the path wherever it shows, a certain floor included.
  const visible = path.status === 'con_ruta' ? path.path : path.status === 'sin_datos' ? path.at_least : null
  const { note, option, tone } = visible === null ? { note: null, option: null, tone: null } : t.renderPath[visible]
  return (
    <div className="stack">
      <div className="row">
        <span className="caption">{m.caption}</span>
        <Badge label={t.gamePathLabel(path)} shape="punteado" />
      </div>
      {t.gamePathSentences(path, minX86Level).map((sentence) => (
        <p key={sentence} className="small">
          {sentence}
        </p>
      ))}
      {note && (
        <p className="small note" data-tone={tone === 'verde' ? 'azul' : 'amarillo'}>
          {note}
        </p>
      )}
      {option && (
        <p className="small muted">
          {m.launchOption} <code>{option}</code>
        </p>
      )}
      {approximate && <p className="small muted">{m.approximate}</p>}
    </div>
  )
}
