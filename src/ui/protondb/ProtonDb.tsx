import type { VarianteProton } from '../../domain/literals.ts'
import type { ProtonDbResumen } from '../../domain/tables.ts'
import { contar, fecha } from '../format.ts'
import { varianteProton } from '../vocabulary.ts'

type Recientes = Pick<ProtonDbResumen, 'recientes' | 'recientes_funcionan' | 'reportes_total'>

/** The license asks for this on every page that shows ProtonDB data. */
export function AtribucionProtonDb() {
  return (
    <p className="pequeno tenue">
      Datos de <a href="https://www.protondb.com">ProtonDB</a>, licencia{' '}
      <a href="https://opendatacommons.org/licenses/odbl/">ODbL</a>.
    </p>
  )
}

const funcionan = (n: number, de: number) =>
  de === 0 ? 'ningún reporte' : `${n} de ${contar(de, 'reporte', 'reportes')} ${n === 1 ? 'dice' : 'dicen'} que funciona`

export function LineaProtonDb({ resumen }: { resumen: Recientes }) {
  return (
    <p className="juego-meta">
      {resumen.recientes === 0
        ? `ProtonDB: sin reportes en el último año (${resumen.reportes_total} en total)`
        : `ProtonDB: ${funcionan(resumen.recientes_funcionan, resumen.recientes)} en el último año`}
    </p>
  )
}

const capa = (variante: VarianteProton, version: string | null) =>
  version === null ? varianteProton[variante] : `${varianteProton[variante]} (${version})`

/** The ficha's section: aggregates only, never individual reports (8.9). */
export function SeccionProtonDb({ protondb: p }: { protondb: (ProtonDbResumen & { readonly app_id: string }) | null }) {
  if (p === null) return <p className="tarjeta tenue">Sin datos de ProtonDB para este juego todavía.</p>
  return (
    <div className="tarjeta pila">
      <p className="pequeno tenue">
        Reportes de la comunidad de ProtonDB sobre la edición de Steam. Son otra fuente: no cuentan para el estado de
        OpenGame.
      </p>
      <ul className="pila sin-margen">
        <li>
          Último año: <b>{funcionan(p.recientes_funcionan, p.recientes)}</b>
        </li>
        <li>
          En equipos modestos (8 GB de RAM o menos, o gráficos Intel integrados):{' '}
          <b>{funcionan(p.modestos_funcionan, p.modestos_recientes)}</b>
        </li>
        <li>
          {contar(p.reportes_total, 'reporte', 'reportes')} en total · último reporte {fecha(p.ultimo_reporte)}
        </li>
        {p.capa_variante !== null && (
          <li>
            Lo más usado entre los que funcionan: <b>{capa(p.capa_variante, p.capa_version)}</b> (
            {contar(p.capa_reportes, 'reporte', 'reportes')})
          </li>
        )}
      </ul>
      <p className="pequeno tenue">
        «Último año» son los 12 meses antes del export de ProtonDB del {fecha(p.exportado_en)}.{' '}
        <a href={`https://www.protondb.com/app/${encodeURIComponent(p.app_id)}`}>Ver el juego en ProtonDB</a>
      </p>
      <AtribucionProtonDb />
    </div>
  )
}
