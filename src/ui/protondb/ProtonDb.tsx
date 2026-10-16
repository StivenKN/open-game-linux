import type { ProtonVariant } from '../../domain/literals.ts'
import type { ProtonDbSummary } from '../../domain/tables.ts'
import { count, date } from '../format.ts'
import { protonVariant } from '../vocabulary.ts'

type Recent = Pick<ProtonDbSummary, 'recientes' | 'recientes_funcionan' | 'reportes_total'>

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
      {summary.recientes === 0
        ? `ProtonDB: sin reportes en el último año (${summary.reportes_total} en total)`
        : `ProtonDB: ${workingLine(summary.recientes_funcionan, summary.recientes)} en el último año`}
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
          Último año: <b>{workingLine(p.recientes_funcionan, p.recientes)}</b>
        </li>
        <li>
          En equipos modestos (8 GB de RAM o menos, o gráficos Intel integrados):{' '}
          <b>{workingLine(p.modestos_funcionan, p.modestos_recientes)}</b>
        </li>
        <li>
          {count(p.reportes_total, 'reporte', 'reportes')} en total · último reporte {date(p.ultimo_reporte)}
        </li>
        {p.capa_variante !== null && (
          <li>
            Lo más usado entre los que funcionan: <b>{layer(p.capa_variante, p.capa_version)}</b> (
            {count(p.capa_reportes, 'reporte', 'reportes')})
          </li>
        )}
      </ul>
      <p className="pequeno tenue">
        «Último año» son los 12 meses antes del export de ProtonDB del {date(p.exportado_en)}.{' '}
        <a href={`https://www.protondb.com/app/${encodeURIComponent(p.app_id)}`}>Ver el juego en ProtonDB</a>
      </p>
      <ProtonDbAttribution />
    </div>
  )
}
