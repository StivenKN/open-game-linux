// Catalog and search (wireframe 9.1). The filters live in the URL, validated by the same Schema the
// server fn uses, so a filtered catalog is a link anyone can share.
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { Effect, Schema, Struct } from 'effect'
import type { FormEvent, ReactNode } from 'react'
import { FiltroCatalogo } from '../dominio/aportes.ts'
import { EstadoCompatibilidad } from '../dominio/compatibilidad.ts'
import { catalogoFn } from '../fns/catalogo.ts'
import { ChipsFallos } from '../ui/compatibilidad/ChipsFallos.tsx'
import { contar, fecha } from '../ui/formato.ts'
import { Insignia } from '../ui/Insignia.tsx'
import { SelloEjemplo } from '../ui/SelloEjemplo.tsx'
import { estadoCompatibilidad } from '../ui/vocabulario.ts'

/** A URL is typed by hand: a value that does not decode drops its filter instead of failing the page. */
const opcional = <S extends Schema.Constraint>(campo: S) => Schema.catchDecoding<S>(() => Effect.succeedNone)(campo)
const Busqueda = FiltroCatalogo.mapFields((f) => ({
  q: opcional(f.q),
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

/** The same filter with `clave` set to `valor`, or without it when it already holds `valor` (a toggle). */
const alternar = <K extends 'estado' | 'lanzador' | 'sin_anti_cheat'>(
  filtro: FiltroCatalogo,
  clave: K,
  valor: NonNullable<FiltroCatalogo[K]>,
): FiltroCatalogo => (filtro[clave] === valor ? Struct.omit(filtro, [clave]) : { ...filtro, [clave]: valor })

function Catalogo() {
  const { juegos, lanzadores, contadores } = Route.useLoaderData()
  const filtro = Route.useLoaderDeps()
  const navigate = useNavigate({ from: '/' })
  const filtrado = Object.keys(filtro).length > 0

  const buscar = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const q = new FormData(e.currentTarget).get('q')
    const texto = typeof q === 'string' ? q.trim() : ''
    void navigate({ search: texto === '' ? Struct.omit(filtro, ['q']) : { ...filtro, q: texto } })
  }

  return (
    <main className="envoltura">
      <section className="portada">
        <h1>¿Tu juego de Windows corre en Linux?</h1>
        <p className="tenue">
          Cada estado se calcula al consultar, a partir de reportes que un revisor aprobó. Los pendientes se muestran
          aparte y no cuentan.
        </p>
        <form role="search" className="buscador" method="get" action="/" onSubmit={buscar}>
          <label htmlFor="q" className="solo-lector">
            Buscar un juego por título
          </label>
          <input id="q" name="q" type="search" placeholder="Escribe un juego, por ejemplo GTA V" defaultValue={filtro.q ?? ''} key={filtro.q} />
          <button type="submit">Buscar</button>
        </form>
        <div className="pila filtros" aria-label="Filtros">
          <div className="fila">
            <span className="rotulo">Estado</span>
            {EstadoCompatibilidad.literals.map((e) => (
              <Filtro key={e} activo={filtro.estado === e} search={alternar(filtro, 'estado', e)}>
                {estadoCompatibilidad[e].texto}
              </Filtro>
            ))}
          </div>
          <div className="fila">
            <span className="rotulo">Lanzador</span>
            {lanzadores.map((l) => (
              <Filtro key={l.id} activo={filtro.lanzador === l.id} search={alternar(filtro, 'lanzador', l.id)}>
                {l.nombre}
              </Filtro>
            ))}
            <Filtro activo={filtro.sin_anti_cheat === true} search={alternar(filtro, 'sin_anti_cheat', true)}>
              Sin bloqueo anti-cheat
            </Filtro>
            {filtrado && (
              <Link to="/" search={{}} className="pequeno">
                Quitar filtros
              </Link>
            )}
          </div>
        </div>
      </section>

      <ul className="contadores" aria-label="Evidencia aprobada">
        <Contador valor={contadores.juegos_verificados} texto="juegos con reportes aprobados" />
        <Contador valor={contadores.reportes_aprobados} texto="reportes aprobados" />
        <Contador valor={contadores.perfiles_aprobados} texto="perfiles aprobados" />
        <Contador valor={contadores.distribuciones_probadas} texto="distribuciones probadas" />
      </ul>

      <h2 className="titulo-seccion">{filtrado ? contar(juegos.length, 'juego coincide', 'juegos coinciden') : 'Catálogo'}</h2>
      {juegos.length === 0 ? (
        <p className="tarjeta tenue">Ningún juego coincide con estos filtros.</p>
      ) : (
        <ul className="lista-juegos">
          {juegos.map((j) => (
            <li key={j.id} className="tarjeta pila">
              <div className="fila">
                <Link to="/juegos/$juegoId" params={{ juegoId: j.id }} className="nombre-juego">
                  {j.titulo}
                </Link>
                {j.ejemplo && <SelloEjemplo />}
              </div>
              <div className="fila-chips">
                {j.lanzadores.map((l) => (
                  <span key={l} className="chip">
                    {l}
                  </span>
                ))}
              </div>
              <div className="fila">
                <Insignia etiqueta={estadoCompatibilidad[j.resumen.estado]} />
                <span className="pequeno tenue">
                  {j.resumen.ultima_prueba
                    ? `${contar(j.resumen.pruebas, 'reporte aprobado', 'reportes aprobados')} · última prueba ${fecha(j.resumen.ultima_prueba)}`
                    : 'Nadie ha aprobado una prueba todavía'}
                </span>
              </div>
              {j.pendientes > 0 && (
                <p className="pequeno tenue">{`+ ${contar(j.pendientes, 'pendiente', 'pendientes')} de revisión (no cuentan)`}</p>
              )}
              {j.resumen.fallos.length > 0 && (
                <p className="pequeno">
                  Causas observadas: <ChipsFallos fallos={j.resumen.fallos} />
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}

/** A filter is a link, so it works without JavaScript and the URL is the state. */
function Filtro({ activo, search, children }: { activo: boolean; search: FiltroCatalogo; children: ReactNode }) {
  return (
    <Link to="/" search={search} className="chip filtro" data-activo={activo || undefined} aria-current={activo || undefined}>
      {children}
    </Link>
  )
}

function Contador({ valor, texto }: { valor: number; texto: string }) {
  return (
    <li className="tarjeta">
      <b className="cifra">{valor}</b>
      <span className="pequeno tenue">{texto}</span>
    </li>
  )
}
