import { createFileRoute, Link } from '@tanstack/react-router'
import { GameId } from '../../domain/ids.ts'
import { gamePageFn } from '../../fns/catalog.ts'
import { EstadoJuego } from '../../ui/compatibility/GameStatus.tsx'
import { MatrizEntornos } from '../../ui/compatibility/EnvironmentMatrix.tsx'
import { VeredictoParaMi } from '../../ui/compatibility/VerdictForMe.tsx'
import { contar, fecha } from '../../ui/format.ts'
import { Chip, Insignia } from '../../ui/Badge.tsx'
import { Arte } from '../../ui/Cover.tsx'
import { SeccionProtonDb } from '../../ui/protondb/ProtonDb.tsx'
import { SelloEjemplo } from '../../ui/DemoStamp.tsx'
import { apiGrafica, nivelX86, tipoFallo, veredictoRequisitos } from '../../ui/vocabulary.ts'
import { idDeRuta } from '../-ids.ts'

const juegoId = idDeRuta(GameId)

export const Route = createFileRoute('/juegos/$juegoId')({
  params: { parse: (p) => ({ juegoId: juegoId(p.juegoId) }), stringify: (p) => ({ juegoId: String(p.juegoId) }) },
  loader: ({ params }) => gamePageFn({ data: params }),
  head: ({ loaderData }) => ({ meta: [{ title: loaderData ? `${loaderData.game.titulo} · OpenGame Linux` : 'OpenGame Linux' }] }),
  component: Ficha,
})

function Ficha() {
  const { game: juego, editions: ediciones, summary: resumen, protondb, ejemplo, pending: pendientes, profiles: perfiles, causes: causas, diagnostic: diagnostico, personal } = Route.useLoaderData()
  const reportar = (
    <Link to="/juegos/$juegoId/reportar" params={{ juegoId: juego.id }} className="boton">
      Reportar un resultado
    </Link>
  )
  return (
    <main className="envoltura">
      <header className="ficha-banner">
        <Arte titulo={juego.titulo} ancho={1320} alto={420} />
        <div className="ficha-banner-texto">
          <nav className="migas" aria-label="Migas de pan">
            <Link to="/">Catálogo</Link> / {juego.titulo}
          </nav>
          <h1 className="titulo-ficha">{juego.titulo}</h1>
          <div className="fila" aria-label="Ediciones">
            {ediciones.map((e) => (
              <span key={e.id} className="etiqueta">
                {e.lanzador}
                {e.identificador_externo && <span className="tenue"> {e.identificador_externo}</span>}
              </span>
            ))}
            {ejemplo && <SelloEjemplo />}
          </div>
          <p className="ficha-descripcion">{juego.descripcion}</p>
          <p className="ficha-descripcion pequeno fila">
            <span>{juego.apis.length === 0 ? 'APIs gráficas sin declarar' : `Gráficos: ${juego.apis.map((api) => apiGrafica[api]).join(' · ')}`}</span>
            {juego.nivel_x86_min !== null && <span>CPU mínima: {nivelX86[juego.nivel_x86_min]}</span>}
          </p>
        </div>
        <div className="ficha-accion">{reportar}</div>
      </header>

      <div className="ficha-cuerpo">
        <EstadoJuego resumen={resumen} pendientes={pendientes} />
        <VeredictoParaMi personal={personal}>
          {diagnostico && (
            <p className="pequeno tenue">
              Según tu diagnóstico más reciente: {diagnostico.equipo}, {fecha(diagnostico.capturado_en)}.
            </p>
          )}
        </VeredictoParaMi>
      </div>

      <section className="seccion" aria-labelledby="entornos">
        <h2 id="entornos">Dónde lo probaron</h2>
        <p className="tenue">Cada fila es un entorno con reportes aprobados.</p>
        <MatrizEntornos entornos={resumen.setups} miDistribucion={diagnostico?.distribucion_id ?? null} />
      </section>

      <section className="seccion" aria-labelledby="protondb">
        <h2 id="protondb">Otras fuentes: ProtonDB</h2>
        <SeccionProtonDb protondb={protondb} />
      </section>

      <div className="seccion dos">
        <section aria-labelledby="perfiles">
          <h2 id="perfiles">Perfiles de configuración</h2>
          {perfiles.length === 0 ? (
            <p className="tarjeta tenue">Todavía no hay perfiles para este juego.</p>
          ) : (
            <ul className="lista-tarjetas">
              {perfiles.map((p) => (
                <li key={p.id} className="tarjeta pila">
                  <div className="fila">
                    <Link to="/perfiles/$perfilId" params={{ perfilId: p.id }} className="nombre-juego">
                      {p.titulo} r{p.revision}
                    </Link>
                    {p.estado_revision === 'pendiente' && <Chip tono="gris">en prueba</Chip>}
                  </div>
                  <div className="fila-chips">
                    <span className="chip">{p.lanzador}</span>
                    <span className="chip">{p.distribucion}</span>
                    <span className="chip">{p.capa}</span>
                    <span className="chip">{p.arquitectura}</span>
                    {p.ejemplo && <SelloEjemplo />}
                  </div>
                  {p.estado_revision === 'pendiente' ? (
                    <p className="pequeno tenue">Aún no está aprobado. Puedes probarlo: tu reporte aporta la evidencia que su aprobación necesita.</p>
                  ) : (
                    p.evaluation && (
                      <div className="fila pequeno">
                        <span>Tu equipo:</span>
                        <Insignia etiqueta={veredictoRequisitos[p.evaluation.verdict]} forma="punteado" />
                      </div>
                    )
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="causas">
          <h2 id="causas">Causas y soluciones</h2>
          {causas.length === 0 ? (
            <p className="tarjeta tenue">Ningún reporte aprobado registra un fallo.</p>
          ) : (
            <ul className="lista-tarjetas">
              {causas.map((c) => {
                const etiqueta = tipoFallo(c.code)
                return (
                  <li key={c.code} className="tarjeta pila">
                    <div className="fila">
                      <Chip tono={etiqueta.tono}>{etiqueta.texto}</Chip>
                      <span className="pequeno tenue">{contar(c.reports, 'reporte aprobado', 'reportes aprobados')}</span>
                    </div>
                    {c.descripcion && <p>{c.descripcion}</p>}
                    {c.solutions.length === 0 ? (
                      <p className="pequeno tenue">Sin soluciones verificadas todavía.</p>
                    ) : (
                      c.solutions.map((s) => (
                        <div key={s.id} className="solucion pila">
                          <div className="fila">
                            <b>{s.titulo}</b>
                            {s.ejemplo && <SelloEjemplo />}
                          </div>
                          <p className="texto-largo pequeno">{s.instrucciones}</p>
                          <p className="pequeno tenue">
                            Aportada por {s.autor}
                            {s.perfil && <>. Recomienda el perfil {s.perfil}</>}.
                          </p>
                        </div>
                      ))
                    )}
                    {c.reply !== null && (
                      <p className="pequeno">
                        <Link
                          to="/reportes/$reporteId/solucion"
                          params={{ reporteId: c.reply.reporte_id }}
                          search={{ tipoFallo: c.reply.tipo_fallo_id }}
                        >
                          Proponer una solución
                        </Link>
                      </p>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </div>

      <section className="reportar" aria-labelledby="reportar">
        <div>
          <h2 id="reportar">¿Lo jugaste en Linux?</h2>
          <p className="tenue">Cuenta en qué distribución y con qué configuración. Un revisor lo aprueba y pasa a contar.</p>
        </div>
        {reportar}
      </section>
    </main>
  )
}
