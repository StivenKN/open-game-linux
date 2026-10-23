import type { AntiCheatStatus } from '../../domain/literals.ts'
import type { AntiCheatEntry } from '../../domain/tables.ts'
import { Badge } from '../Badge.tsx'
import { date } from '../format.ts'
import { antiCheatStatus } from '../vocabulary.ts'

/** The MIT license asks to keep its notice with the data; the link carries it. */
export function AntiCheatAttribution() {
  return (
    <p className="small muted">
      Datos de <a href="https://areweanticheatyet.com">AreWeAntiCheatYet</a>, licencia{' '}
      <a href="https://github.com/AreWeAntiCheatYet/AreWeAntiCheatYet/blob/master/LICENSE">MIT</a>.
    </p>
  )
}

/** The catalog card's line, shown only for a status that blocks online play. */
export function AntiCheatLine({ status }: { status: AntiCheatStatus }) {
  return <p className="game-card-meta">{antiCheatStatus[status].text} según AreWeAntiCheatYet</p>
}

/** The game page's section. It never changes OpenGame's computed state. */
export function AntiCheatSection({ anticheat: a }: { anticheat: AntiCheatEntry | null }) {
  if (a === null)
    return <p className="card muted">Sin datos de AreWeAntiCheatYet para este juego. Esa lista solo incluye juegos con anti-cheat.</p>
  const label = antiCheatStatus[a.status]
  return (
    <div className="card stack">
      <p className="small muted">
        Lo que la lista comunitaria AreWeAntiCheatYet sabe del anti-cheat de la edición de Steam en Linux. Es otra fuente:
        no cuenta para el estado de OpenGame.
      </p>
      <div className="row">
        <Badge label={label} />
      </div>
      <p>{label.meaning}</p>
      <ul className="stack no-margin">
        {a.anticheats.length > 0 && (
          <li>
            Anti-cheat: <b>{a.anticheats.join(', ')}</b>
          </li>
        )}
        {a.changed_at !== null && <li>Última actualización en la lista: {date(a.changed_at)}</li>}
      </ul>
      <p className="small muted">
        <a href={`https://areweanticheatyet.com/game/${encodeURIComponent(a.slug)}`}>Ver el juego en AreWeAntiCheatYet</a>
      </p>
      <AntiCheatAttribution />
    </div>
  )
}
