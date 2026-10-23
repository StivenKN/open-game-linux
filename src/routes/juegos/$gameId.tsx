import { createFileRoute, Link } from '@tanstack/react-router'
import { hasNews } from '../../domain/follow.ts'
import { GameId } from '../../domain/ids.ts'
import { gamePageFn } from '../../fns/catalog.ts'
import { originFn } from '../../fns/diagnostic.ts'
import { CopyBox } from '../../ui/compatibility/CopyBox.tsx'
import { GameStatus } from '../../ui/compatibility/GameStatus.tsx'
import { EnvironmentMatrix } from '../../ui/compatibility/EnvironmentMatrix.tsx'
import { LayerTimeline } from '../../ui/compatibility/LayerTimeline.tsx'
import { ScopedStatus } from '../../ui/compatibility/ScopedStatus.tsx'
import { VerdictForMe } from '../../ui/compatibility/VerdictForMe.tsx'
import { count, date } from '../../ui/format.ts'
import { Chip, Badge } from '../../ui/Badge.tsx'
import { Artwork } from '../../ui/Cover.tsx'
import { ProtonDbSection } from '../../ui/protondb/ProtonDb.tsx'
import { AntiCheatSection } from '../../ui/anticheat/AntiCheat.tsx'
import { DemoStamp } from '../../ui/DemoStamp.tsx'
import { graphicsApi, x86Level, failureType, requirementsVerdict } from '../../ui/vocabulary.ts'
import { FollowButton, FollowNews } from '../-follow.tsx'
import { routeIdParser } from '../-ids.ts'

const gameId = routeIdParser(GameId)

export const Route = createFileRoute('/juegos/$gameId')({
  params: { parse: (p) => ({ gameId: gameId(p.gameId) }), stringify: (p) => ({ gameId: String(p.gameId) }) },
  loader: async ({ params }) => {
    const [page, siteOrigin] = await Promise.all([gamePageFn({ data: params }), originFn()])
    return { ...page, siteOrigin }
  },
  head: ({ loaderData }) => ({ meta: [{ title: loaderData ? `${loaderData.game.title} · OpenGame Linux` : 'OpenGame Linux' }] }),
  component: GamePage,
})

function GamePage() {
  const { game, editions, steam_app_id: steamAppId, summary, steam_deck, timeline, as_of, follow, protondb, anticheat, demo, pending, profiles, causes, diagnostic, personal, siteOrigin } =
    Route.useLoaderData()
  const { visitor } = Route.useRouteContext()
  const reportLink = (
    <Link to="/juegos/$gameId/reportar" params={{ gameId: game.id }} className="button">
      Reportar un resultado
    </Link>
  )
  return (
    <main className="wrapper">
      <header className="game-page-banner">
        <Artwork title={game.title} width={1320} height={420} />
        <div className="game-page-banner-text">
          <nav className="breadcrumbs" aria-label="Migas de pan">
            <Link to="/">Catálogo</Link> / {game.title}
          </nav>
          <h1 className="game-page-title">{game.title}</h1>
          <div className="row" aria-label="Ediciones">
            {editions.map((e) => (
              <span key={e.id} className="label">
                {e.launcher}
                {e.external_id && <span className="muted"> {e.external_id}</span>}
              </span>
            ))}
            {demo && <DemoStamp />}
          </div>
          <p className="game-page-description">{game.description}</p>
          <p className="game-page-description small row">
            <span>{game.apis.length === 0 ? 'APIs gráficas sin declarar' : `Gráficos: ${game.apis.map((api) => graphicsApi[api]).join(' · ')}`}</span>
            {game.x86_level_min !== null && <span>CPU mínima: {x86Level[game.x86_level_min]}</span>}
          </p>
        </div>
        <div className="game-page-action">
          <FollowButton gameId={game.id} signedIn={visitor !== null} following={follow !== null} />
          {reportLink}
        </div>
      </header>

      {follow !== null && hasNews(follow.news) && (
        <FollowNews gameId={game.id} status={summary.status} seenAt={follow.seen_at} news={follow.news} asOf={as_of} />
      )}

      <div className="game-page-body">
        <GameStatus summary={summary} pending={pending}>
          {summary.test_count > 0 && <ScopedStatus label="En Steam Deck:" summary={steam_deck} none="nadie ha aprobado una prueba en una Steam Deck" />}
        </GameStatus>
        <VerdictForMe personal={personal}>
          {diagnostic && (
            <p className="small muted">
              Según tu diagnóstico más reciente: {diagnostic.machine}, {date(diagnostic.captured_at)}.
            </p>
          )}
        </VerdictForMe>
      </div>

      <section className="section" aria-labelledby="setups">
        <h2 id="setups">Dónde lo probaron</h2>
        <p className="muted">Cada fila es un entorno con reportes aprobados.</p>
        <EnvironmentMatrix setups={summary.setups} myDistribution={diagnostic?.distribution_id ?? null} />
      </section>

      {timeline.length > 0 && (
        <section className="section" aria-labelledby="history">
          <h2 id="history">Historial por versión</h2>
          <p className="muted">
            Cada paso es una versión de Proton, Wine o nativa, en el orden en que se probó por primera vez. Cuentan todos los
            reportes aprobados, de cualquier fecha.
          </p>
          <LayerTimeline history={timeline} />
        </section>
      )}

      <section className="section" aria-labelledby="protondb">
        <h2 id="protondb">Otras fuentes: ProtonDB</h2>
        <ProtonDbSection protondb={protondb} />
      </section>

      <section className="section" aria-labelledby="anticheat">
        <h2 id="anticheat">Otras fuentes: AreWeAntiCheatYet</h2>
        <AntiCheatSection anticheat={anticheat} />
      </section>

      <div className="section columns-2">
        <section aria-labelledby="profiles">
          <h2 id="profiles">Perfiles de configuración</h2>
          {profiles.length === 0 ? (
            <p className="card muted">Todavía no hay perfiles para este juego.</p>
          ) : (
            <ul className="card-list">
              {profiles.map((p) => (
                <li key={p.id} className="card stack">
                  <div className="row">
                    <Link to="/perfiles/$profileId" params={{ profileId: p.id }} className="game-name">
                      {p.title} r{p.revision}
                    </Link>
                    {p.review_status === 'pendiente' && <Chip tone="gris">en prueba</Chip>}
                  </div>
                  <div className="chip-row">
                    <span className="chip">{p.launcher}</span>
                    <span className="chip">{p.distribution}</span>
                    <span className="chip">{p.layer}</span>
                    <span className="chip">{p.architecture}</span>
                    {p.demo && <DemoStamp />}
                  </div>
                  {p.review_status === 'pendiente' ? (
                    <p className="small muted">Aún no está aprobado y ningún revisor ha leído sus pasos. Si lo pruebas, tu reporte aporta la evidencia que su aprobación necesita.</p>
                  ) : (
                    p.evaluation && (
                      <div className="row small">
                        <span>Tu equipo:</span>
                        <Badge label={requirementsVerdict[p.evaluation.verdict]} shape="punteado" />
                      </div>
                    )
                  )}
                </li>
              ))}
            </ul>
          )}
          <p className="small block">
            <Link to="/juegos/$gameId/perfiles/nuevo" params={{ gameId: game.id }}>
              Proponer un perfil
            </Link>
          </p>
        </section>

        <section aria-labelledby="causes">
          <h2 id="causes">Causas y soluciones</h2>
          {causes.length === 0 ? (
            <p className="card muted">Ningún reporte aprobado registra un fallo.</p>
          ) : (
            <ul className="card-list">
              {causes.map((c) => {
                const label = failureType(c.code)
                return (
                  <li key={c.code} className="card stack">
                    <div className="row">
                      <Chip tone={label.tone}>{label.text}</Chip>
                      <span className="small muted">{count(c.reports, 'reporte aprobado', 'reportes aprobados')}</span>
                    </div>
                    {c.description && <p>{c.description}</p>}
                    {c.solutions.length === 0 ? (
                      <p className="small muted">Sin soluciones verificadas todavía.</p>
                    ) : (
                      c.solutions.map((s) => (
                        <div key={s.id} className="solution stack">
                          <div className="row">
                            <b>{s.title}</b>
                            {s.demo && <DemoStamp />}
                          </div>
                          <p className="long-text small">{s.instructions}</p>
                          <p className="small muted">
                            Aportada por {s.author}
                            {s.profile && <>. Recomienda el perfil {s.profile}</>}.
                          </p>
                        </div>
                      ))
                    )}
                    {c.reply !== null && (
                      <p className="small">
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

      <section className="report" aria-labelledby="report">
        <div className="report-text">
          <h2 id="report">¿Lo jugaste en Linux?</h2>
          <p className="muted">Cuenta en qué distribución y con qué configuración. Un revisor lo aprueba y pasa a contar.</p>
          {steamAppId !== null && (
            <div className="stack report-detector">
              <p className="small">
                ¿No sabes tu versión de Proton? Ejecuta esto en el equipo donde jugaste: lee la herramienta de compatibilidad que
                Steam usa para este juego, sus opciones de lanzamiento y su build, y abre el formulario lleno para que lo revises.
              </p>
              <CopyBox label="Reportar con el detector, en Linux" text={`curl -fsSL ${siteOrigin}/opengame-detect.sh | bash -s -- --game ${steamAppId}`} />
              <p className="small muted">En Windows no hay modo de reporte: un reporte necesita un diagnóstico hecho en Linux.</p>
            </div>
          )}
        </div>
        {reportLink}
      </section>
    </main>
  )
}
