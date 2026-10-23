import type { ReactNode } from 'react'
import { count } from '../../format.ts'

const reports = (n: number) => count(n, 'reporte', 'reportes')
const working = (n: number, total: number) => (total === 0 ? 'ningún reporte' : `${n} de ${reports(total)} ${n === 1 ? 'dice' : 'dicen'} que funciona`)

/** The other sources a game page and the catalog cite: ProtonDB and AreWeAntiCheatYet. */
export const sources = {
  protondb: {
    /** The license asks for this on every page that shows ProtonDB data. */
    attribution: (
      <>
        Datos de <a href="https://www.protondb.com">ProtonDB</a>, licencia <a href="https://opendatacommons.org/licenses/odbl/">ODbL</a>.
      </>
    ),
    line: (n: number, total: number, allTime: number) =>
      total === 0 ? `ProtonDB: sin reportes en el último año (${allTime} en total)` : `ProtonDB: ${working(n, total)} en el último año`,
    heading: 'Otras fuentes: ProtonDB',
    empty: 'Sin datos de ProtonDB para este juego todavía.',
    intro: 'Reportes de la comunidad de ProtonDB sobre la edición de Steam. Son otra fuente: no cuentan para el estado de OpenGame.',
    lastYear: (n: number, total: number) => (
      <>
        Último año: <b>{working(n, total)}</b>
      </>
    ),
    modest: (n: number, total: number) => (
      <>
        En equipos modestos (8 GB de RAM o menos, o gráficos Intel integrados): <b>{working(n, total)}</b>
      </>
    ),
    total: (n: number, latest: string) => `${reports(n)} en total · último reporte ${latest}`,
    mostUsed: (layer: string, n: number) => (
      <>
        Lo más usado entre los que funcionan: <b>{layer}</b> ({reports(n)})
      </>
    ),
    window: (exported: string) => `«Último año» son los 12 meses antes del export de ProtonDB del ${exported}.`,
    viewGame: 'Ver el juego en ProtonDB',
  },
  anticheat: {
    /** The MIT license asks to keep its notice with the data; the link carries it. */
    attribution: (
      <>
        Datos de <a href="https://areweanticheatyet.com">AreWeAntiCheatYet</a>, licencia{' '}
        <a href="https://github.com/AreWeAntiCheatYet/AreWeAntiCheatYet/blob/master/LICENSE">MIT</a>.
      </>
    ),
    line: (status: string) => `${status} según AreWeAntiCheatYet`,
    heading: 'Otras fuentes: AreWeAntiCheatYet',
    empty: 'Sin datos de AreWeAntiCheatYet para este juego. OpenGame lo busca en esa lista por el identificador de su edición de Steam.',
    intro:
      'Lo que la lista comunitaria AreWeAntiCheatYet sabe del anti-cheat de la edición de Steam en Linux. Es otra fuente: no cuenta para el estado de OpenGame.',
    anticheats: (names: ReactNode) => <>Anti-cheat: {names}</>,
    changed: (date: string) => `Última actualización en la lista: ${date}`,
    viewGame: 'Ver el juego en AreWeAntiCheatYet',
  },
}
