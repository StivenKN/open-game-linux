import type { ProtonVariant } from '../../domain/literals.ts'
import type { ProtonDbSummary } from '../../domain/tables.ts'
import { count, date } from '../format.ts'
import { protonVariant } from '../vocabulary.ts'

type Recent = Pick<ProtonDbSummary, 'recent' | 'recent_working' | 'total_reports'>

/** The license asks for this on every page that shows ProtonDB data. */
export function ProtonDbAttribution() {
  return (
    <p className="pequeno tenue">
      Datos de <a href="https://www.protondb.com">ProtonDB</a>, licencia{' '}
      <a href="https://opendatacommons.org/licenses/odbl/">ODbL</a>.
    </p>
  )
}

const workingLine = (n: number, total: number) =>
  total === 0 ? 'ningún reporte' : `${n} de ${count(total, 'reporte', 'reportes')} ${n === 1 ? 'dice' : 'dicen'} que funciona`

export function ProtonDbLine({ summary }: { summary: Recent }) {
  return (
    <p className="juego-meta">
      {summary.recent === 0
        ? `ProtonDB: sin reportes en el último año (${summary.total_reports} en total)`
        : `ProtonDB: ${workingLine(summary.recent_working, summary.recent)} en el último año`}
    </p>
  )
}

const layer = (variant: ProtonVariant, version: string | null) =>
  version === null ? protonVariant[variant] : `${protonVariant[variant]} (${version})`

/** The game page's section: aggregates only, never individual reports (8.9). */
export function ProtonDbSection({ protondb: p }: { protondb: (ProtonDbSummary & { readonly app_id: string }) | null }) {
  if (p === null) return <p className="tarjeta tenue">Sin datos de ProtonDB para este juego todavía.</p>
  return (
    <div className="tarjeta pila">
      <p className="pequeno tenue">
        Reportes de la comunidad de ProtonDB sobre la edición de Steam. Son otra fuente: no cuentan para el estado de
        OpenGame.
      </p>
      <ul className="pila sin-margen">
        <li>
          Último año: <b>{workingLine(p.recent_working, p.recent)}</b>
        </li>
        <li>
          En equipos modestos (8 GB de RAM o menos, o gráficos Intel integrados):{' '}
          <b>{workingLine(p.modest_working, p.modest_recent)}</b>
        </li>
        <li>
          {count(p.total_reports, 'reporte', 'reportes')} en total · último reporte {date(p.latest_report)}
        </li>
        {p.layer_variant !== null && (
          <li>
            Lo más usado entre los que funcionan: <b>{layer(p.layer_variant, p.layer_version)}</b> (
            {count(p.layer_reports, 'reporte', 'reportes')})
          </li>
        )}
      </ul>
      <p className="pequeno tenue">
        «Último año» son los 12 meses antes del export de ProtonDB del {date(p.exported_at)}.{' '}
        <a href={`https://www.protondb.com/app/${encodeURIComponent(p.app_id)}`}>Ver el juego en ProtonDB</a>
      </p>
      <ProtonDbAttribution />
    </div>
  )
}
