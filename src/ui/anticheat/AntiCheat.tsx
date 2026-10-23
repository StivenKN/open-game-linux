import type { AntiCheatStatus } from '../../domain/literals.ts'
import type { AntiCheatEntry } from '../../domain/tables.ts'
import { Badge } from '../Badge.tsx'
import { useT } from '../i18n/messages.ts'

/** The MIT license asks to keep its notice with the data; the link carries it. */
export function AntiCheatAttribution() {
  return <p className="small muted">{useT().sources.anticheat.attribution}</p>
}

/** The catalog card's line, shown only for a status that blocks online play. */
export function AntiCheatLine({ status }: { status: AntiCheatStatus }) {
  const t = useT()
  return <p className="game-card-meta">{t.sources.anticheat.line(t.antiCheatStatus[status].text)}</p>
}

/** The game page's section. It never changes OpenGame's computed state. */
export function AntiCheatSection({ anticheat: a }: { anticheat: AntiCheatEntry | null }) {
  const t = useT()
  const s = t.sources.anticheat
  if (a === null) return <p className="card muted">{s.empty}</p>
  const label = t.antiCheatStatus[a.status]
  return (
    <div className="card stack">
      <p className="small muted">{s.intro}</p>
      <div className="row">
        <Badge label={label} />
      </div>
      <p>{label.meaning}</p>
      <ul className="stack no-margin">
        {a.anticheats.length > 0 && <li>{s.anticheats(<b>{a.anticheats.join(', ')}</b>)}</li>}
        {a.changed_at !== null && <li>{s.changed(t.date(a.changed_at))}</li>}
      </ul>
      <p className="small muted">
        <a href={`https://areweanticheatyet.com/game/${encodeURIComponent(a.slug)}`}>{s.viewGame}</a>
      </p>
      <AntiCheatAttribution />
    </div>
  )
}
