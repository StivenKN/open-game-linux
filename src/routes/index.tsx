import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { Effect, Schema, SchemaTransformation, Struct } from 'effect'
import type { FormEvent, ReactNode } from 'react'
import { FiltroCatalogo } from '../dominio/aportes.ts'
import { EstadoCompatibilidad } from '../dominio/compatibilidad.ts'
import { catalogoFn } from '../fns/catalogo.ts'
import { ChipsFallos } from '../ui/compatibilidad/ChipsFallos.tsx'
import { contar, fecha } from '../ui/formato.ts'
import { Portada } from '../ui/Portada.tsx'
import { AtribucionProtonDb, LineaProtonDb } from '../ui/protondb/ProtonDb.tsx'
import { estadoCompatibilidad, significadoEstado } from '../ui/vocabulario.ts'

const opcional = <S extends Schema.Constraint>(campo: S) => Schema.catchDecoding<S>(() => Effect.succeedNone)(campo)
// The router JSON-parses each query value, so a title typed as `?q=2` arrives as the number 2.
const TextoBuscado = Schema.Union([Schema.String, Schema.Finite, Schema.Boolean]).pipe(
  Schema.decodeTo(Schema.String, SchemaTransformation.transform<string, string | number | boolean>({ decode: String, encode: (s) => s })),
)
const Busqueda = FiltroCatalogo.mapFields((f) => ({
  q: opcional(Schema.optionalKey(TextoBuscado)),
  estado: opcional(f.estado),
  lanzador: opcional(f.lanzador),
  sin_anti_cheat: opcional(f.sin_anti_cheat),
}))

const limpiar = Schema.decodeUnknownSync(Busqueda)

export const Route = createFileRoute('/')({
  validateSearch: Schema.toStandardSchemaV1(Busqueda),
  // router-core keeps raw query keys that validateSearch dropped in `search`, so the loader and the page
  // read this cleaned copy instead.
  loaderDeps: ({ search }) => limpiar(search),
  loader: ({ deps }) => catalogoFn({ data: deps }),
  head: () => ({ meta: [{ title: 'Catálogo · OpenGame Linux' }] }),
  component: Catalogo,
})

const alternar = <K extends 'estado' | 'lanzador' | 'sin_anti_cheat'>(
  filtro: FiltroCatalogo,
  clave: K,
  valor: NonNullable<FiltroCatalogo[K]>,
): FiltroCatalogo => (filtro[clave] === valor ? Struct.omit(filtro, [clave]) : { ...filtro, [clave]: valor })

// A filter link points at the toggled-off search, which the router's default partial match would call the
// current page; exact matching leaves aria-current to the filter's own state.
const soloIgual = { exact: true } as const

// The hero fans out the games with the most approved reports, the busiest one in front.
const posiciones = ['centro', 'izquierda', 'derecha'] as const

function Catalogo() {
  const { juegos, por_estado, lanzadores, contadores } = Route.useLoaderData()
  const filtro = Route.useLoaderDeps()
  const navigate = useNavigate({ from: '/' })
  const filtrado = Object.keys(filtro).length > 0
  const destacados = [...juegos].sort((a, b) => b.resumen.pruebas - a.resumen.pruebas).slice(0, posiciones.length)
  const activos = [
    filtro.q === undefined ? undefined : `«${filtro.q}»`,
    filtro.estado === undefined ? undefined : estadoCompatibilidad[filtro.estado].texto,
    lanzadores.find((l) => l.id === filtro.lanzador)?.nombre,
    filtro.sin_anti_cheat === true ? 'sin bloqueo anti-cheat' : undefined,
  ].filter((a) => a !== undefined)

  const buscar = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const q = new FormData(e.currentTarget).get('q')
    const texto = typeof q === 'string' ? q.trim() : ''
    void navigate({ search: texto === '' ? Struct.omit(filtro, ['q']) : { ...filtro, q: texto } })
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
          <form role="search" className="buscador" method="get" action="/" onSubmit={buscar}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-4-4" />
            </svg>
            <label htmlFor="q" className="solo-lector">
              Buscar un juego por título
            </label>
            <input id="q" name="q" type="search" placeholder="¿Qué quieres jugar?" defaultValue={filtro.q ?? ''} key={filtro.q} />
            {/* Without JavaScript the browser submits only the form's fields; these keep the active filters. */}
            {filtro.estado !== undefined && <input type="hidden" name="estado" value={filtro.estado} />}
            {filtro.lanzador !== undefined && <input type="hidden" name="lanzador" value={filtro.lanzador} />}
            {filtro.sin_anti_cheat === true && <input type="hidden" name="sin_anti_cheat" value="true" />}
            <button type="submit">Buscar</button>
          </form>
          {destacados.length > 0 && (
            <p className="sugerencias">
              <span className="tenue">Prueba:</span>
              {destacados.map((j) => (
                <Link key={j.id} to="/" search={{ q: j.titulo }} className="sugerencia">
                  {j.titulo}
                </Link>
              ))}
            </p>
          )}
          <p className="cifras">
            Hasta hoy hay <b>{contar(contadores.reportes_aprobados, 'reporte aprobado', 'reportes aprobados')}</b> sobre{' '}
            <b>{contar(contadores.juegos_verificados, 'juego verificado', 'juegos verificados')}</b>, en{' '}
            <b>{contar(contadores.distribuciones_probadas, 'distribución', 'distribuciones')}</b>, y{' '}
            <b>{contar(contadores.perfiles_aprobados, 'perfil de configuración', 'perfiles de configuración')}</b> para copiar.
          </p>
        </div>
        <div className="abanico" aria-hidden="true">
          {destacados.map((j, i) => (
            <div key={j.id} className="abanico-carta" data-posicion={posiciones[i]}>
              <Portada titulo={j.titulo} estado={j.resumen.estado} ejemplo={j.ejemplo} />
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
              {EstadoCompatibilidad.literals.map((e) => {
                const etiqueta = estadoCompatibilidad[e]
                return (
                  <li key={e}>
                    <Filtro activo={filtro.estado === e} search={alternar(filtro, 'estado', e)} cuenta={por_estado[e]}>
                      <span className="punto" data-tono={etiqueta.tono} data-forma="relleno" data-estado={e} />
                      <span className="opcion-nombre">{etiqueta.texto}</span>
                      <span className="opcion-que">{significadoEstado[e]}</span>
                    </Filtro>
                  </li>
                )
              })}
            </ul>
            {/* Narrow screens hide each option's meaning and show only the active one here; screen readers
                still get it from the active link itself. */}
            {filtro.estado !== undefined && (
              <p className="estado-significado" aria-hidden="true">
                {significadoEstado[filtro.estado]}
              </p>
            )}
          </section>
          <section aria-labelledby="filtro-lanzador">
            <h2 id="filtro-lanzador" className="lateral-titulo">
              Lanzador
            </h2>
            <ul className="opciones">
              {lanzadores.map((l) => (
                <li key={l.id}>
                  <Filtro activo={filtro.lanzador === l.id} search={alternar(filtro, 'lanzador', l.id)}>
                    <span className="opcion-nombre">{l.nombre}</span>
                  </Filtro>
                </li>
              ))}
            </ul>
          </section>
          <Link
            to="/"
            search={alternar(filtro, 'sin_anti_cheat', true)}
            activeOptions={soloIgual}
            className="interruptor"
            aria-current={filtro.sin_anti_cheat === true || undefined}
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
            <h2 id="titulo-rejilla">{contar(juegos.length, 'juego', 'juegos')}</h2>
            <span className="tenue">{activos.length > 0 ? activos.join(', ') : 'en el catálogo'}</span>
            {filtrado && (
              <Link to="/" search={{}} activeOptions={soloIgual} className="limpiar">
                Quitar filtros
              </Link>
            )}
          </div>
          {juegos.length === 0 ? (
            <p className="vacio">
              {filtrado ? 'Ningún juego coincide con estos filtros. Quita alguno o busca otro título.' : 'Todavía no hay juegos en el catálogo.'}
            </p>
          ) : (
            <ul className="rejilla-juegos">
              {juegos.map((j) => (
                <li key={j.id} className="juego">
                  <Link to="/juegos/$juegoId" params={{ juegoId: j.id }} className="juego-enlace">
                    <span className="juego-nombre">{j.titulo}</span>
                    <Portada titulo={j.titulo} estado={j.resumen.estado} ejemplo={j.ejemplo} />
                  </Link>
                  <p className="juego-meta">
                    <span className="juego-lanzadores">{j.lanzadores.join(', ')}</span>
                    <br />
                    {j.resumen.ultima_prueba
                      ? `${contar(j.resumen.pruebas, 'reporte aprobado', 'reportes aprobados')} · última prueba ${fecha(j.resumen.ultima_prueba)}`
                      : 'Nadie ha aprobado una prueba todavía'}
                    {j.resumen.sin_confirmacion_reciente && (
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
                  {j.protondb && <LineaProtonDb resumen={j.protondb} />}
                  {j.resumen.fallos.length > 0 && <ChipsFallos fallos={j.resumen.fallos} />}
                </li>
              ))}
            </ul>
          )}
          {juegos.some((j) => j.protondb) && <AtribucionProtonDb />}
        </section>
      </div>
    </main>
  )
}

function Filtro({ activo, search, cuenta, children }: { activo: boolean; search: FiltroCatalogo; cuenta?: number; children: ReactNode }) {
  return (
    <Link to="/" search={search} activeOptions={soloIgual} className="opcion" aria-current={activo || undefined}>
      {children}
      {cuenta !== undefined && (
        <span className="opcion-cuenta">
          {cuenta}
          <span className="solo-lector"> {cuenta === 1 ? 'juego' : 'juegos'}</span>
        </span>
      )}
    </Link>
  )
}
