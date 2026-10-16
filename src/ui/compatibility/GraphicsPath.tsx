import type { X86Level } from '../../domain/platform.ts'
import type { GamePath } from '../../domain/graphics-path.ts'
import { Badge } from '../Badge.tsx'
import { renderPath, gamePathLabel, gamePathSentences } from '../vocabulary.ts'

/**
 * The hardware-only graphics path for one game. It stands apart from the community state and the
 * profile check: it needs no reports.
 */
export function GraphicsPath({ path, minX86Level, approximate }: { path: GamePath; minX86Level: X86Level | null; approximate: boolean }) {
  // The warning and launch option follow the path wherever it shows, a certain floor included.
  const visible = path.status === 'con_ruta' ? path.path : path.status === 'sin_datos' ? path.at_least : null
  const { note, option, tone } = visible === null ? { note: null, option: null, tone: null } : renderPath[visible]
  return (
    <div className="pila">
      <div className="fila">
        <span className="rotulo">Ruta gráfica</span>
        <Badge label={gamePathLabel(path)} shape="punteado" />
      </div>
      {gamePathSentences(path, minX86Level).map((sentence) => (
        <p key={sentence} className="pequeno">
          {sentence}
        </p>
      ))}
      {note && (
        <p className="pequeno nota" data-tono={tone === 'verde' ? 'azul' : 'amarillo'}>
          {note}
        </p>
      )}
      {option && (
        <p className="pequeno tenue">
          Opción de lanzamiento en Steam: <code>{option}</code>
        </p>
      )}
      {approximate && <p className="pequeno tenue">Calculada desde un diagnóstico de Windows: sirve de orientación.</p>}
    </div>
  )
}
