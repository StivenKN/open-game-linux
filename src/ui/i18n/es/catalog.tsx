import { count } from '../../format.ts'

type Counters = {
  readonly approved_reports: number
  readonly verified_games: number
  readonly tested_distributions: number
  readonly approved_profiles: number
  readonly upstream_fixes: number
}

/** The catalog, which is the home page. */
export const catalog = {
  title: 'Catálogo',
  heading: 'Lleva tu biblioteca de Windows a Linux.',
  lede: 'Busca un juego y mira cómo les fue a jugadores que ya lo probaron, en su distribución y con su configuración. Solo cuenta lo que un revisor aprobó, y el estado usa los reportes del último año cuando los hay.',
  searchLabel: 'Buscar un juego por título',
  searchPlaceholder: '¿Qué quieres jugar?',
  search: 'Buscar',
  suggestions: 'Prueba:',
  figures: (c: Counters) => (
    <>
      Hasta hoy hay <b>{count(c.approved_reports, 'reporte aprobado', 'reportes aprobados')}</b> sobre{' '}
      <b>{count(c.verified_games, 'juego verificado', 'juegos verificados')}</b>, en{' '}
      <b>{count(c.tested_distributions, 'distribución', 'distribuciones')}</b>,{' '}
      <b>{count(c.approved_profiles, 'perfil de configuración', 'perfiles de configuración')}</b> para copiar y{' '}
      <b>{count(c.upstream_fixes, 'arreglo aceptado', 'arreglos aceptados')}</b> en umu-protonfixes.
    </>
  ),
  filters: 'Filtros',
  status: 'Estado',
  launcher: 'Lanzador',
  /** How the bar above the grid names each active filter. */
  active: { query: (q: string) => `«${q}»`, noAntiCheatBlock: 'sin bloqueo anti-cheat', steamDeck: 'probado en Steam Deck' },
  noAntiCheatBlock: {
    title: 'Sin bloqueo anti-cheat',
    help: 'Oculta los juegos con reportes bloqueados por un anti-cheat y los que AreWeAntiCheatYet marca como rotos o denegados.',
  },
  steamDeck: { title: 'Probado en Steam Deck', help: 'Solo los juegos con un reporte aprobado que funciona en una Steam Deck.' },
  games: (n: number) => count(n, 'juego', 'juegos'),
  /** After a filter's number, for screen readers. */
  gamesNoun: (n: number): string => (n === 1 ? 'juego' : 'juegos'),
  inCatalog: 'en el catálogo',
  clearFilters: 'Quitar filtros',
  noMatch: 'Ningún juego coincide con estos filtros. Quita alguno o busca otro título.',
  empty: 'Todavía no hay juegos en el catálogo.',
  requestMissing: '¿No está? Pídelo',
  requestNearMiss: '¿No es ninguno de estos? Pídelo',
  card: {
    tested: (n: number, last: string) => `${count(n, 'reporte aprobado', 'reportes aprobados')} · última prueba ${last}`,
    untested: 'Nadie ha aprobado una prueba todavía',
    noRecent: 'Sin confirmación en el último año',
    pending: (n: number) => (n === 1 ? '1 reporte espera revisión y no cuenta' : `${n} reportes esperan revisión y no cuentan`),
  },
}
