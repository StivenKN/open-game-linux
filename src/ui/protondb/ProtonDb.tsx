import type { ProtonVariant } from '../../domain/literals.ts'
import type { ProtonDbSummary } from '../../domain/tables.ts'
import type { Messages } from '../i18n/es.ts'
import { useT } from '../i18n/messages.ts'

type Recent = Pick<ProtonDbSummary, 'recent' | 'recent_working' | 'total_reports'>

/** The license asks for this on every page that shows ProtonDB data. */
export function ProtonDbAttribution() {
  return <p className="small muted">{useT().sources.protondb.attribution}</p>
}

export function ProtonDbLine({ summary }: { summary: Recent }) {
  return <p className="game-card-meta">{useT().sources.protondb.line(summary.recent_working, summary.recent, summary.total_reports)}</p>
}

const layer = (t: Messages, variant: ProtonVariant, version: string | null) =>
  version === null ? t.protonVariant[variant] : `${t.protonVariant[variant]} (${version})`

/** The game page's section: aggregates only, never individual reports (8.9). */
export function ProtonDbSection({ protondb: p }: { protondb: (ProtonDbSummary & { readonly app_id: string }) | null }) {
  const t = useT()
  const s = t.sources.protondb
  if (p === null) return <p className="card muted">{s.empty}</p>
  return (
    <div className="card stack">
      <p className="small muted">{s.intro}</p>
      <ul className="stack no-margin">
        <li>{s.lastYear(p.recent_working, p.recent)}</li>
        <li>{s.modest(p.modest_working, p.modest_recent)}</li>
        <li>{s.total(p.total_reports, t.date(p.latest_report))}</li>
        {p.layer_variant !== null && <li>{s.mostUsed(layer(t, p.layer_variant, p.layer_version), p.layer_reports)}</li>}
      </ul>
      <p className="small muted">
        {s.window(t.date(p.exported_at))} <a href={`https://www.protondb.com/app/${encodeURIComponent(p.app_id)}`}>{s.viewGame}</a>
      </p>
      <ProtonDbAttribution />
    </div>
  )
}
