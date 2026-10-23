import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { Schema, Struct } from 'effect'
import type { FormEvent, ReactNode } from 'react'
import { CatalogFilter } from '../../domain/contributions.ts'
import { CompatibilityStatus } from '../../domain/compatibility.ts'
import { catalogFn } from '../../fns/catalog.ts'
import { FailureChips } from '../../ui/compatibility/FailureChips.tsx'
import { Cover } from '../../ui/Cover.tsx'
import { ProtonDbAttribution, ProtonDbLine } from '../../ui/protondb/ProtonDb.tsx'
import { AntiCheatAttribution, AntiCheatLine } from '../../ui/anticheat/AntiCheat.tsx'
import { useLang, useT } from '../../ui/i18n/messages.ts'
import { titled } from '../-head.ts'
import { lenient, SearchText } from '../-search.ts'

const CatalogSearch = CatalogFilter.mapFields((f) => ({
  q: lenient(Schema.optionalKey(SearchText)),
  estado: lenient(f.estado),
  lanzador: lenient(f.lanzador),
  sin_anti_cheat: lenient(f.sin_anti_cheat),
  steam_deck: lenient(f.steam_deck),
}))

const cleanSearch = Schema.decodeUnknownSync(CatalogSearch)

export const Route = createFileRoute('/$lang/')({
  validateSearch: Schema.toStandardSchemaV1(CatalogSearch),
  // router-core keeps raw query keys that validateSearch dropped in `search`, so the loader and the page
  // read this cleaned copy instead.
  loaderDeps: ({ search }) => cleanSearch(search),
  loader: ({ deps }) => catalogFn({ data: deps }),
  head: ({ params }) => titled(params.lang, (t) => t.catalog.title),
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
  const navigate = useNavigate({ from: '/$lang/' })
  const t = useT()
  const lang = useLang()
  const c = t.catalog
  const filtered = Object.keys(filter).length > 0
  const featured = [...games].sort((a, b) => b.summary.test_count - a.summary.test_count).slice(0, positions.length)
  const active = [
    filter.q === undefined ? undefined : c.active.query(filter.q),
    filter.estado === undefined ? undefined : t.compatibilityStatus[filter.estado].text,
    launchers.find((l) => l.id === filter.lanzador)?.name,
    filter.sin_anti_cheat === true ? c.active.noAntiCheatBlock : undefined,
    filter.steam_deck === true ? c.active.steamDeck : undefined,
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
          <h1>{c.heading}</h1>
          <p className="lede">{c.lede}</p>
          <form role="search" className="search" method="get" action={`/${lang}`} onSubmit={onSearch}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-4-4" />
            </svg>
            <label htmlFor="q" className="sr-only">
              {c.searchLabel}
            </label>
            <input id="q" name="q" type="search" placeholder={c.searchPlaceholder} defaultValue={filter.q ?? ''} key={filter.q} />
            {/* Without JavaScript the browser submits only the form's fields; these keep the active filters. */}
            {filter.estado !== undefined && <input type="hidden" name="estado" value={filter.estado} />}
            {filter.lanzador !== undefined && <input type="hidden" name="lanzador" value={filter.lanzador} />}
            {filter.sin_anti_cheat === true && <input type="hidden" name="sin_anti_cheat" value="true" />}
            {filter.steam_deck === true && <input type="hidden" name="steam_deck" value="true" />}
            <button type="submit">{c.search}</button>
          </form>
          {featured.length > 0 && (
            <p className="suggestions">
              <span className="muted">{c.suggestions}</span>
              {featured.map((j) => (
                <Link key={j.id} to="/$lang" params={{ lang }} search={{ q: j.title }} className="suggestion">
                  {j.title}
                </Link>
              ))}
            </p>
          )}
          <p className="figures">{c.figures(counters)}</p>
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
        <aside className="sidebar" aria-label={c.filters}>
          <section aria-labelledby="status-filter">
            <h2 id="status-filter" className="sidebar-title">
              {c.status}
            </h2>
            <ul className="options">
              {CompatibilityStatus.literals.map((e) => {
                const label = t.compatibilityStatus[e]
                return (
                  <li key={e}>
                    <FilterLink active={filter.estado === e} search={toggle(filter, 'estado', e)} total={byStatus[e]}>
                      <span className="dot" data-tone={label.tone} data-shape="relleno" data-state={e} />
                      <span className="option-name">{label.text}</span>
                      <span className="option-what">{t.statusMeaning[e]}</span>
                    </FilterLink>
                  </li>
                )
              })}
            </ul>
            {/* Narrow screens hide each option's meaning and show only the active one here; screen readers
                still get it from the active link itself. */}
            {filter.estado !== undefined && (
              <p className="status-meaning" aria-hidden="true">
                {t.statusMeaning[filter.estado]}
              </p>
            )}
          </section>
          <section aria-labelledby="launcher-filter">
            <h2 id="launcher-filter" className="sidebar-title">
              {c.launcher}
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
            to="/$lang"
            params={{ lang }}
            search={toggle(filter, 'sin_anti_cheat', true)}
            activeOptions={exactOnly}
            className="switch"
            aria-current={filter.sin_anti_cheat === true || undefined}
          >
            <span className="track" />
            <span>
              <b>{c.noAntiCheatBlock.title}</b>
              <small>{c.noAntiCheatBlock.help}</small>
            </span>
          </Link>
          <Link
            to="/$lang"
            params={{ lang }}
            search={toggle(filter, 'steam_deck', true)}
            activeOptions={exactOnly}
            className="switch"
            aria-current={filter.steam_deck === true || undefined}
          >
            <span className="track" />
            <span>
              <b>{c.steamDeck.title}</b>
              <small>{c.steamDeck.help}</small>
            </span>
          </Link>
        </aside>

        <section aria-labelledby="grid-title">
          <div className="grid-bar">
            <h2 id="grid-title">{c.games(games.length)}</h2>
            <span className="muted">{active.length > 0 ? active.join(', ') : c.inCatalog}</span>
            {filtered && (
              <Link to="/$lang" params={{ lang }} search={{}} activeOptions={exactOnly} className="clean">
                {c.clearFilters}
              </Link>
            )}
          </div>
          {games.length === 0 ? (
            <div className="empty stack">
              <p className="no-margin">
                {filtered ? c.noMatch : c.empty}
              </p>
              {filter.q !== undefined && (
                <p className="no-margin">
                  <Link to="/$lang/pedidos" params={{ lang }} search={{ titulo: filter.q }}>
                    {c.requestMissing}
                  </Link>
                </p>
              )}
            </div>
          ) : (
            <ul className="game-grid">
              {games.map((j) => (
                <li key={j.id} className="game-card">
                  <Link to="/$lang/juegos/$gameId" params={{ lang, gameId: j.id }} className="game-card-link">
                    <span className="game-card-name">{j.title}</span>
                    <Cover title={j.title} status={j.summary.status} sample={j.demo} />
                  </Link>
                  <p className="game-card-meta">
                    <span className="game-card-launchers">{j.launchers.join(', ')}</span>
                    <br />
                    {j.summary.last_tested ? c.card.tested(j.summary.test_count, t.date(j.summary.last_tested)) : c.card.untested}
                    {j.summary.no_recent_confirmation && (
                      <>
                        <br />
                        {c.card.noRecent}
                      </>
                    )}
                    {j.pending > 0 && (
                      <>
                        <br />
                        {c.card.pending(j.pending)}
                      </>
                    )}
                  </p>
                  {j.protondb && <ProtonDbLine summary={j.protondb} />}
                  {j.anticheat && <AntiCheatLine status={j.anticheat} />}
                  {j.summary.failures.length > 0 && <FailureChips failures={j.summary.failures} />}
                </li>
              ))}
            </ul>
          )}
          {/* A near miss can stand in for a missing game: «The Witcher 2» finds The Witcher 3. */}
          {filter.q !== undefined && games.length > 0 && (
            <p className="small muted">
              <Link to="/$lang/pedidos" params={{ lang }} search={{ titulo: filter.q }}>
                {c.requestNearMiss}
              </Link>
            </p>
          )}
          {games.some((j) => j.protondb) && <ProtonDbAttribution />}
          {games.some((j) => j.anticheat) && <AntiCheatAttribution />}
        </section>
      </div>
    </main>
  )
}

function FilterLink({ active, search, total, children }: { active: boolean; search: CatalogFilter; total?: number; children: ReactNode }) {
  const t = useT()
  return (
    <Link to="/$lang" params={{ lang: useLang() }} search={search} activeOptions={exactOnly} className="option" aria-current={active || undefined}>
      {children}
      {total !== undefined && (
        <span className="option-count">
          {total}
          <span className="sr-only"> {t.catalog.gamesNoun(total)}</span>
        </span>
      )}
    </Link>
  )
}
