import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { Schema, Struct } from 'effect'
import type { FormEvent, ReactNode } from 'react'
import { CatalogFilter } from '../domain/contributions.ts'
import { CompatibilityStatus } from '../domain/compatibility.ts'
import { catalogFn } from '../fns/catalog.ts'
import { FailureChips } from '../ui/compatibility/FailureChips.tsx'
import { count, date } from '../ui/format.ts'
import { Cover } from '../ui/Cover.tsx'
import { ProtonDbAttribution, ProtonDbLine } from '../ui/protondb/ProtonDb.tsx'
import { compatibilityStatus, statusMeaning } from '../ui/vocabulary.ts'
import { lenient, SearchText } from './-search.ts'

const CatalogSearch = CatalogFilter.mapFields((f) => ({
  q: lenient(Schema.optionalKey(SearchText)),
  estado: lenient(f.estado),
  lanzador: lenient(f.lanzador),
  sin_anti_cheat: lenient(f.sin_anti_cheat),
  steam_deck: lenient(f.steam_deck),
}))

const cleanSearch = Schema.decodeUnknownSync(CatalogSearch)

export const Route = createFileRoute('/')({
  validateSearch: Schema.toStandardSchemaV1(CatalogSearch),
  // router-core keeps raw query keys that validateSearch dropped in `search`, so the loader and the page
  // read this cleaned copy instead.
  loaderDeps: ({ search }) => cleanSearch(search),
  loader: ({ deps }) => catalogFn({ data: deps }),
  head: () => ({ meta: [{ title: 'Catálogo · OpenGame Linux' }] }),
  component: CatalogPage,
})

const toggle = <K extends 'estado' | 'lanzador' | 'sin_anti_cheat' | 'steam_deck'>(
  filter: CatalogFilter,
  key: K,
  value: NonNullable<CatalogFilter[K]>,
): CatalogFilter => (filter[key] === value ? Struct.omit(filter, [key]) : { ...filter, [key]: value })

// A filter link points at the toggled-off search, which the router's default partial match would call the
// current page; exact matching leaves aria-current to the filter's own state.
const exactOnly = { exact: true } as const

// The hero fans out the games with the most approved reports, the busiest one in front.
const positions = ['centro', 'izquierda', 'derecha'] as const

function CatalogPage() {
  const { games, by_status: byStatus, launchers, counters } = Route.useLoaderData()
  const filter = Route.useLoaderDeps()
  const navigate = useNavigate({ from: '/' })
  const filtered = Object.keys(filter).length > 0
  const featured = [...games].sort((a, b) => b.summary.test_count - a.summary.test_count).slice(0, positions.length)
  const active = [
    filter.q === undefined ? undefined : `«${filter.q}»`,
    filter.estado === undefined ? undefined : compatibilityStatus[filter.estado].text,
    launchers.find((l) => l.id === filter.lanzador)?.name,
    filter.sin_anti_cheat === true ? 'sin bloqueo anti-cheat' : undefined,
    filter.steam_deck === true ? 'probado en Steam Deck' : undefined,
  ].filter((a) => a !== undefined)

  const onSearch = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const q = new FormData(e.currentTarget).get('q')
    const text = typeof q === 'string' ? q.trim() : ''
    void navigate({ search: text === '' ? Struct.omit(filter, ['q']) : { ...filter, q: text } })
  }

  return (
    <main className="wrapper">
      <section className="intro">
        <div>
          <h1>Lleva tu biblioteca de Windows a Linux.</h1>
          <p className="lede">
            Busca un juego y mira cómo les fue a jugadores que ya lo probaron, en su distribución y con su configuración.
            Solo cuenta lo que un revisor aprobó, y el estado usa los reportes del último año cuando los hay.
          </p>
          <form role="search" className="search" method="get" action="/" onSubmit={onSearch}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-4-4" />
            </svg>
            <label htmlFor="q" className="sr-only">
              Buscar un juego por título
            </label>
            <input id="q" name="q" type="search" placeholder="¿Qué quieres jugar?" defaultValue={filter.q ?? ''} key={filter.q} />
            {/* Without JavaScript the browser submits only the form's fields; these keep the active filters. */}
            {filter.estado !== undefined && <input type="hidden" name="estado" value={filter.estado} />}
            {filter.lanzador !== undefined && <input type="hidden" name="lanzador" value={filter.lanzador} />}
            {filter.sin_anti_cheat === true && <input type="hidden" name="sin_anti_cheat" value="true" />}
            {filter.steam_deck === true && <input type="hidden" name="steam_deck" value="true" />}
            <button type="submit">Buscar</button>
          </form>
          {featured.length > 0 && (
            <p className="suggestions">
              <span className="muted">Prueba:</span>
              {featured.map((j) => (
                <Link key={j.id} to="/" search={{ q: j.title }} className="suggestion">
                  {j.title}
                </Link>
              ))}
            </p>
          )}
          <p className="figures">
            Hasta hoy hay <b>{count(counters.approved_reports, 'reporte aprobado', 'reportes aprobados')}</b> sobre{' '}
            <b>{count(counters.verified_games, 'juego verificado', 'juegos verificados')}</b>, en{' '}
            <b>{count(counters.tested_distributions, 'distribución', 'distribuciones')}</b>,{' '}
            <b>{count(counters.approved_profiles, 'perfil de configuración', 'perfiles de configuración')}</b> para copiar y{' '}
            <b>{count(counters.upstream_fixes, 'arreglo aceptado', 'arreglos aceptados')}</b> en umu-protonfixes.
          </p>
        </div>
        <div className="fan" aria-hidden="true">
          {featured.map((j, i) => (
            <div key={j.id} className="fan-card" data-position={positions[i]}>
              <Cover title={j.title} status={j.summary.status} sample={j.demo} />
            </div>
          ))}
        </div>
      </section>

      <div className="library">
        <aside className="sidebar" aria-label="Filtros">
          <section aria-labelledby="status-filter">
            <h2 id="status-filter" className="sidebar-title">
              Estado
            </h2>
            <ul className="options">
              {CompatibilityStatus.literals.map((e) => {
                const label = compatibilityStatus[e]
                return (
                  <li key={e}>
                    <FilterLink active={filter.estado === e} search={toggle(filter, 'estado', e)} total={byStatus[e]}>
                      <span className="dot" data-tone={label.tone} data-shape="relleno" data-state={e} />
                      <span className="option-name">{label.text}</span>
                      <span className="option-what">{statusMeaning[e]}</span>
                    </FilterLink>
                  </li>
                )
              })}
            </ul>
            {/* Narrow screens hide each option's meaning and show only the active one here; screen readers
                still get it from the active link itself. */}
            {filter.estado !== undefined && (
              <p className="status-meaning" aria-hidden="true">
                {statusMeaning[filter.estado]}
              </p>
            )}
          </section>
          <section aria-labelledby="launcher-filter">
            <h2 id="launcher-filter" className="sidebar-title">
              Lanzador
            </h2>
            <ul className="options">
              {launchers.map((l) => (
                <li key={l.id}>
                  <FilterLink active={filter.lanzador === l.id} search={toggle(filter, 'lanzador', l.id)}>
                    <span className="option-name">{l.name}</span>
                  </FilterLink>
                </li>
              ))}
            </ul>
          </section>
          <Link
            to="/"
            search={toggle(filter, 'sin_anti_cheat', true)}
            activeOptions={exactOnly}
            className="switch"
            aria-current={filter.sin_anti_cheat === true || undefined}
          >
            <span className="track" />
            <span>
              <b>Sin bloqueo anti-cheat</b>
              <small>Oculta los juegos con reportes bloqueados por un anti-cheat.</small>
            </span>
          </Link>
          <Link
            to="/"
            search={toggle(filter, 'steam_deck', true)}
            activeOptions={exactOnly}
            className="switch"
            aria-current={filter.steam_deck === true || undefined}
          >
            <span className="track" />
            <span>
              <b>Probado en Steam Deck</b>
              <small>Solo los juegos con un reporte aprobado que funciona en una Steam Deck.</small>
            </span>
          </Link>
        </aside>

        <section aria-labelledby="grid-title">
          <div className="grid-bar">
            <h2 id="grid-title">{count(games.length, 'juego', 'juegos')}</h2>
            <span className="muted">{active.length > 0 ? active.join(', ') : 'en el catálogo'}</span>
            {filtered && (
              <Link to="/" search={{}} activeOptions={exactOnly} className="clean">
                Quitar filtros
              </Link>
            )}
          </div>
          {games.length === 0 ? (
            <div className="empty stack">
              <p className="no-margin">
                {filtered ? 'Ningún juego coincide con estos filtros. Quita alguno o busca otro título.' : 'Todavía no hay juegos en el catálogo.'}
              </p>
              {filter.q !== undefined && (
                <p className="no-margin">
                  <Link to="/pedidos" search={{ titulo: filter.q }}>
                    ¿No está? Pídelo
                  </Link>
                </p>
              )}
            </div>
          ) : (
            <ul className="game-grid">
              {games.map((j) => (
                <li key={j.id} className="game-card">
                  <Link to="/juegos/$gameId" params={{ gameId: j.id }} className="game-card-link">
                    <span className="game-card-name">{j.title}</span>
                    <Cover title={j.title} status={j.summary.status} sample={j.demo} />
                  </Link>
                  <p className="game-card-meta">
                    <span className="game-card-launchers">{j.launchers.join(', ')}</span>
                    <br />
                    {j.summary.last_tested
                      ? `${count(j.summary.test_count, 'reporte aprobado', 'reportes aprobados')} · última prueba ${date(j.summary.last_tested)}`
                      : 'Nadie ha aprobado una prueba todavía'}
                    {j.summary.no_recent_confirmation && (
                      <>
                        <br />
                        Sin confirmación en el último año
                      </>
                    )}
                    {j.pending > 0 && (
                      <>
                        <br />
                        {j.pending === 1 ? '1 reporte espera revisión y no cuenta' : `${j.pending} reportes esperan revisión y no cuentan`}
                      </>
                    )}
                  </p>
                  {j.protondb && <ProtonDbLine summary={j.protondb} />}
                  {j.summary.failures.length > 0 && <FailureChips failures={j.summary.failures} />}
                </li>
              ))}
            </ul>
          )}
          {/* A near miss can stand in for a missing game: «The Witcher 2» finds The Witcher 3. */}
          {filter.q !== undefined && games.length > 0 && (
            <p className="small muted">
              <Link to="/pedidos" search={{ titulo: filter.q }}>
                ¿No es ninguno de estos? Pídelo
              </Link>
            </p>
          )}
          {games.some((j) => j.protondb) && <ProtonDbAttribution />}
        </section>
      </div>
    </main>
  )
}

function FilterLink({ active, search, total, children }: { active: boolean; search: CatalogFilter; total?: number; children: ReactNode }) {
  return (
    <Link to="/" search={search} activeOptions={exactOnly} className="option" aria-current={active || undefined}>
      {children}
      {total !== undefined && (
        <span className="option-count">
          {total}
          <span className="sr-only"> {total === 1 ? 'juego' : 'juegos'}</span>
        </span>
      )}
    </Link>
  )
}
