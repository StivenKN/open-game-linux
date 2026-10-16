import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { Effect, Schema, SchemaTransformation, Struct } from 'effect'
import type { FormEvent, ReactNode } from 'react'
import { CatalogFilter } from '../domain/contributions.ts'
import { CompatibilityStatus } from '../domain/compatibility.ts'
import { catalogFn } from '../fns/catalog.ts'
import { FailureChips } from '../ui/compatibility/FailureChips.tsx'
import { count, date } from '../ui/format.ts'
import { Cover } from '../ui/Cover.tsx'
import { ProtonDbAttribution, ProtonDbLine } from '../ui/protondb/ProtonDb.tsx'
import { compatibilityStatus, statusMeaning } from '../ui/vocabulary.ts'

const lenient = <S extends Schema.Constraint>(field: S) => Schema.catchDecoding<S>(() => Effect.succeedNone)(field)
// The router JSON-parses each query value, so a title typed as `?q=2` arrives as the number 2.
const SearchText = Schema.Union([Schema.String, Schema.Finite, Schema.Boolean]).pipe(
  Schema.decodeTo(Schema.String, SchemaTransformation.transform<string, string | number | boolean>({ decode: String, encode: (s) => s })),
)
const CatalogSearch = CatalogFilter.mapFields((f) => ({
  q: lenient(Schema.optionalKey(SearchText)),
  estado: lenient(f.estado),
  lanzador: lenient(f.lanzador),
  sin_anti_cheat: lenient(f.sin_anti_cheat),
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

const toggle = <K extends 'estado' | 'lanzador' | 'sin_anti_cheat'>(
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
    launchers.find((l) => l.id === filter.lanzador)?.nombre,
    filter.sin_anti_cheat === true ? 'sin bloqueo anti-cheat' : undefined,
  ].filter((a) => a !== undefined)

  const onSearch = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const q = new FormData(e.currentTarget).get('q')
    const text = typeof q === 'string' ? q.trim() : ''
    void navigate({ search: text === '' ? Struct.omit(filter, ['q']) : { ...filter, q: text } })
  }

  return (
    <main className="envoltura">
      <section className="presentacion">
        <div>
          <h1>Lleva tu biblioteca de Windows a Linux.</h1>
          <p className="bajada">
            Busca un juego y mira cómo les fue a jugadores que ya lo probaron, en su distribución y con su configuración.
            Solo cuenta lo que un revisor aprobó, y el estado usa los reportes del último año cuando los hay.
          </p>
          <form role="search" className="buscador" method="get" action="/" onSubmit={onSearch}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-4-4" />
            </svg>
            <label htmlFor="q" className="solo-lector">
              Buscar un juego por título
            </label>
            <input id="q" name="q" type="search" placeholder="¿Qué quieres jugar?" defaultValue={filter.q ?? ''} key={filter.q} />
            {/* Without JavaScript the browser submits only the form's fields; these keep the active filters. */}
            {filter.estado !== undefined && <input type="hidden" name="estado" value={filter.estado} />}
            {filter.lanzador !== undefined && <input type="hidden" name="lanzador" value={filter.lanzador} />}
            {filter.sin_anti_cheat === true && <input type="hidden" name="sin_anti_cheat" value="true" />}
            <button type="submit">Buscar</button>
          </form>
          {featured.length > 0 && (
            <p className="sugerencias">
              <span className="tenue">Prueba:</span>
              {featured.map((j) => (
                <Link key={j.id} to="/" search={{ q: j.titulo }} className="sugerencia">
                  {j.titulo}
                </Link>
              ))}
            </p>
          )}
          <p className="cifras">
            Hasta hoy hay <b>{count(counters.reportes_aprobados, 'reporte aprobado', 'reportes aprobados')}</b> sobre{' '}
            <b>{count(counters.juegos_verificados, 'juego verificado', 'juegos verificados')}</b>, en{' '}
            <b>{count(counters.distribuciones_probadas, 'distribución', 'distribuciones')}</b>,{' '}
            <b>{count(counters.perfiles_aprobados, 'perfil de configuración', 'perfiles de configuración')}</b> para copiar y{' '}
            <b>{count(counters.arreglos_upstream, 'arreglo aceptado', 'arreglos aceptados')}</b> en umu-protonfixes.
          </p>
        </div>
        <div className="abanico" aria-hidden="true">
          {featured.map((j, i) => (
            <div key={j.id} className="abanico-carta" data-posicion={positions[i]}>
              <Cover title={j.titulo} status={j.summary.status} sample={j.ejemplo} />
            </div>
          ))}
        </div>
      </section>

      <div className="biblioteca">
        <aside className="lateral" aria-label="Filtros">
          <section aria-labelledby="filtro-estado">
            <h2 id="filtro-estado" className="lateral-titulo">
              Estado
            </h2>
            <ul className="opciones">
              {CompatibilityStatus.literals.map((e) => {
                const label = compatibilityStatus[e]
                return (
                  <li key={e}>
                    <FilterLink active={filter.estado === e} search={toggle(filter, 'estado', e)} total={byStatus[e]}>
                      <span className="punto" data-tono={label.tone} data-forma="relleno" data-estado={e} />
                      <span className="opcion-nombre">{label.text}</span>
                      <span className="opcion-que">{statusMeaning[e]}</span>
                    </FilterLink>
                  </li>
                )
              })}
            </ul>
            {/* Narrow screens hide each option's meaning and show only the active one here; screen readers
                still get it from the active link itself. */}
            {filter.estado !== undefined && (
              <p className="estado-significado" aria-hidden="true">
                {statusMeaning[filter.estado]}
              </p>
            )}
          </section>
          <section aria-labelledby="filtro-lanzador">
            <h2 id="filtro-lanzador" className="lateral-titulo">
              Lanzador
            </h2>
            <ul className="opciones">
              {launchers.map((l) => (
                <li key={l.id}>
                  <FilterLink active={filter.lanzador === l.id} search={toggle(filter, 'lanzador', l.id)}>
                    <span className="opcion-nombre">{l.nombre}</span>
                  </FilterLink>
                </li>
              ))}
            </ul>
          </section>
          <Link
            to="/"
            search={toggle(filter, 'sin_anti_cheat', true)}
            activeOptions={exactOnly}
            className="interruptor"
            aria-current={filter.sin_anti_cheat === true || undefined}
          >
            <span className="pista" />
            <span>
              <b>Sin bloqueo anti-cheat</b>
              <small>Oculta los juegos con reportes bloqueados por un anti-cheat.</small>
            </span>
          </Link>
        </aside>

        <section aria-labelledby="titulo-rejilla">
          <div className="barra-rejilla">
            <h2 id="titulo-rejilla">{count(games.length, 'juego', 'juegos')}</h2>
            <span className="tenue">{active.length > 0 ? active.join(', ') : 'en el catálogo'}</span>
            {filtered && (
              <Link to="/" search={{}} activeOptions={exactOnly} className="limpiar">
                Quitar filtros
              </Link>
            )}
          </div>
          {games.length === 0 ? (
            <p className="vacio">
              {filtered ? 'Ningún juego coincide con estos filtros. Quita alguno o busca otro título.' : 'Todavía no hay juegos en el catálogo.'}
            </p>
          ) : (
            <ul className="rejilla-juegos">
              {games.map((j) => (
                <li key={j.id} className="juego">
                  <Link to="/juegos/$gameId" params={{ gameId: j.id }} className="juego-enlace">
                    <span className="juego-nombre">{j.titulo}</span>
                    <Cover title={j.titulo} status={j.summary.status} sample={j.ejemplo} />
                  </Link>
                  <p className="juego-meta">
                    <span className="juego-lanzadores">{j.lanzadores.join(', ')}</span>
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
                    {j.pendientes > 0 && (
                      <>
                        <br />
                        {j.pendientes === 1 ? '1 reporte espera revisión y no cuenta' : `${j.pendientes} reportes esperan revisión y no cuentan`}
                      </>
                    )}
                  </p>
                  {j.protondb && <ProtonDbLine summary={j.protondb} />}
                  {j.summary.failures.length > 0 && <FailureChips failures={j.summary.failures} />}
                </li>
              ))}
            </ul>
          )}
          {games.some((j) => j.protondb) && <ProtonDbAttribution />}
        </section>
      </div>
    </main>
  )
}

function FilterLink({ active, search, total, children }: { active: boolean; search: CatalogFilter; total?: number; children: ReactNode }) {
  return (
    <Link to="/" search={search} activeOptions={exactOnly} className="opcion" aria-current={active || undefined}>
      {children}
      {total !== undefined && (
        <span className="opcion-cuenta">
          {total}
          <span className="solo-lector"> {total === 1 ? 'juego' : 'juegos'}</span>
        </span>
      )}
    </Link>
  )
}
