import { createFileRoute, Link } from '@tanstack/react-router'
import { GameId } from '../../domain/ids.ts'
import { gamePageFn } from '../../fns/catalog.ts'
import { GameStatus } from '../../ui/compatibility/GameStatus.tsx'
import { EnvironmentMatrix } from '../../ui/compatibility/EnvironmentMatrix.tsx'
import { VerdictForMe } from '../../ui/compatibility/VerdictForMe.tsx'
import { count, date } from '../../ui/format.ts'
import { Chip, Badge } from '../../ui/Badge.tsx'
import { Artwork } from '../../ui/Cover.tsx'
import { ProtonDbSection } from '../../ui/protondb/ProtonDb.tsx'
import { DemoStamp } from '../../ui/DemoStamp.tsx'
import { graphicsApi, x86Level, failureType, requirementsVerdict } from '../../ui/vocabulary.ts'
import { routeIdParser } from '../-ids.ts'

const gameId = routeIdParser(GameId)

export const Route = createFileRoute('/juegos/$gameId')({
  params: { parse: (p) => ({ gameId: gameId(p.gameId) }), stringify: (p) => ({ gameId: String(p.gameId) }) },
  loader: ({ params }) => gamePageFn({ data: params }),
  head: ({ loaderData }) => ({ meta: [{ title: loaderData ? `${loaderData.game.title} · OpenGame Linux` : 'OpenGame Linux' }] }),
  component: GamePage,
})

function GamePage() {
  const { game, editions, summary, protondb, demo, pending, profiles, causes, diagnostic, personal } = Route.useLoaderData()
  const reportLink = (
    <Link to="/juegos/$gameId/reportar" params={{ gameId: game.id }} className="boton">
      Reportar un resultado
    </Link>
  )
  return (
    <main className="envoltura">
      <header className="ficha-banner">
        <Artwork title={game.title} width={1320} height={420} />
        <div className="ficha-banner-texto">
          <nav className="migas" aria-label="Migas de pan">
            <Link to="/">Catálogo</Link> / {game.title}
          </nav>
          <h1 className="titulo-ficha">{game.title}</h1>
          <div className="fila" aria-label="Ediciones">
            {editions.map((e) => (
              <span key={e.id} className="etiqueta">
                {e.launcher}
                {e.external_id && <span className="tenue"> {e.external_id}</span>}
              </span>
            ))}
            {demo && <DemoStamp />}
          </div>
          <p className="ficha-descripcion">{game.description}</p>
          <p className="ficha-descripcion pequeno fila">
            <span>{game.apis.length === 0 ? 'APIs gráficas sin declarar' : `Gráficos: ${game.apis.map((api) => graphicsApi[api]).join(' · ')}`}</span>
            {game.x86_level_min !== null && <span>CPU mínima: {x86Level[game.x86_level_min]}</span>}
          </p>
        </div>
        <div className="ficha-accion">{reportLink}</div>
      </header>

      <div className="ficha-cuerpo">
        <GameStatus summary={summary} pending={pending} />
        <VerdictForMe personal={personal}>
          {diagnostic && (
            <p className="pequeno tenue">
              Según tu diagnóstico más reciente: {diagnostic.machine}, {date(diagnostic.captured_at)}.
            </p>
          )}
        </VerdictForMe>
      </div>

      <section className="seccion" aria-labelledby="entornos">
        <h2 id="entornos">Dónde lo probaron</h2>
        <p className="tenue">Cada fila es un entorno con reportes aprobados.</p>
        <EnvironmentMatrix setups={summary.setups} myDistribution={diagnostic?.distribution_id ?? null} />
      </section>

      <section className="seccion" aria-labelledby="protondb">
        <h2 id="protondb">Otras fuentes: ProtonDB</h2>
        <ProtonDbSection protondb={protondb} />
      </section>

      <div className="seccion dos">
        <section aria-labelledby="perfiles">
          <h2 id="perfiles">Perfiles de configuración</h2>
          {profiles.length === 0 ? (
            <p className="tarjeta tenue">Todavía no hay perfiles para este juego.</p>
          ) : (
            <ul className="lista-tarjetas">
              {profiles.map((p) => (
                <li key={p.id} className="tarjeta pila">
                  <div className="fila">
                    <Link to="/perfiles/$profileId" params={{ profileId: p.id }} className="nombre-juego">
                      {p.title} r{p.revision}
                    </Link>
                    {p.review_status === 'pendiente' && <Chip tone="gris">en prueba</Chip>}
                  </div>
                  <div className="fila-chips">
                    <span className="chip">{p.launcher}</span>
                    <span className="chip">{p.distribution}</span>
                    <span className="chip">{p.layer}</span>
                    <span className="chip">{p.architecture}</span>
                    {p.demo && <DemoStamp />}
                  </div>
                  {p.review_status === 'pendiente' ? (
                    <p className="pequeno tenue">Aún no está aprobado. Puedes probarlo: tu reporte aporta la evidencia que su aprobación necesita.</p>
                  ) : (
                    p.evaluation && (
                      <div className="fila pequeno">
                        <span>Tu equipo:</span>
                        <Badge label={requirementsVerdict[p.evaluation.verdict]} shape="punteado" />
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
          {causes.length === 0 ? (
            <p className="tarjeta tenue">Ningún reporte aprobado registra un fallo.</p>
          ) : (
            <ul className="lista-tarjetas">
              {causes.map((c) => {
                const label = failureType(c.code)
                return (
                  <li key={c.code} className="tarjeta pila">
                    <div className="fila">
                      <Chip tone={label.tone}>{label.text}</Chip>
                      <span className="pequeno tenue">{count(c.reports, 'reporte aprobado', 'reportes aprobados')}</span>
                    </div>
                    {c.description && <p>{c.description}</p>}
                    {c.solutions.length === 0 ? (
                      <p className="pequeno tenue">Sin soluciones verificadas todavía.</p>
                    ) : (
                      c.solutions.map((s) => (
                        <div key={s.id} className="solucion pila">
                          <div className="fila">
                            <b>{s.title}</b>
                            {s.demo && <DemoStamp />}
                          </div>
                          <p className="texto-largo pequeno">{s.instructions}</p>
                          <p className="pequeno tenue">
                            Aportada por {s.author}
                            {s.profile && <>. Recomienda el perfil {s.profile}</>}.
                          </p>
                        </div>
                      ))
                    )}
                    {c.reply !== null && (
                      <p className="pequeno">
                        <Link
                          to="/reportes/$reportId/solucion"
                          params={{ reportId: c.reply.report_id }}
                          search={{ tipoFallo: c.reply.failure_type_id }}
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
        {reportLink}
      </section>
    </main>
  )
}
