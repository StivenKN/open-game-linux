import { createFileRoute, Link } from '@tanstack/react-router'
import type { CompatibilitySummary } from '../../../domain/compatibility.ts'
import { hasNews } from '../../../domain/follow.ts'
import { GameId } from '../../../domain/ids.ts'
import { gamePageFn } from '../../../fns/catalog.ts'
import { CopyBox } from '../../../ui/compatibility/CopyBox.tsx'
import { Embed } from '../../../ui/compatibility/Embed.tsx'
import { GameStatus } from '../../../ui/compatibility/GameStatus.tsx'
import { EnvironmentMatrix } from '../../../ui/compatibility/EnvironmentMatrix.tsx'
import { LayerTimeline } from '../../../ui/compatibility/LayerTimeline.tsx'
import { ScopedStatus } from '../../../ui/compatibility/ScopedStatus.tsx'
import { VerdictForMe } from '../../../ui/compatibility/VerdictForMe.tsx'
import { Chip, Badge } from '../../../ui/Badge.tsx'
import { Artwork } from '../../../ui/Cover.tsx'
import { ProtonDbSection } from '../../../ui/protondb/ProtonDb.tsx'
import { AntiCheatSection } from '../../../ui/anticheat/AntiCheat.tsx'
import { DemoStamp } from '../../../ui/DemoStamp.tsx'
import type { Messages } from '../../../ui/i18n/es.ts'
import { imageQuery, type Lang } from '../../../ui/i18n/lang.ts'
import { messages, useLang, useT } from '../../../ui/i18n/messages.ts'
import { graphicsApi, x86Level } from '../../../ui/vocabulary.ts'
import { FollowButton, FollowNews } from '../../-follow.tsx'
import { routeIdParser } from '../../-ids.ts'
import { previewMeta } from '../../-meta.ts'

const gameId = routeIdParser(GameId)

export const Route = createFileRoute('/$lang/juegos/$gameId')({
  params: { parse: (p) => ({ gameId: gameId(p.gameId) }), stringify: (p) => ({ gameId: String(p.gameId) }) },
  loader: ({ params }) => gamePageFn({ data: params }),
  head: ({ loaderData, match, params }) => ({
    meta: loaderData
      ? [
          { title: messages[params.lang].title(loaderData.game.title) },
          ...previewMeta(match.context.origin, preview(params.lang, loaderData.game, loaderData.summary, loaderData.demo)),
        ]
      : [{ title: 'OpenGame Linux' }],
  }),
  component: GamePage,
})

/** The link preview of a game, in the page's language: its state as the title says it, the approved reports behind it, and the page's demo stamp. */
const preview = (lang: Lang, game: { id: GameId; title: string }, summary: CompatibilitySummary, demo: boolean) => {
  const t: Messages = messages[lang]
  const state = t.share.game.title(game.title, t.compatibilityStatus[summary.status].text)
  const reports = summary.test_count === 0 ? t.share.game.noReports : t.share.game.reports(summary.test_count, summary.no_recent_confirmation)
  const description = demo ? `${reports} ${t.share.game.demo}` : reports
  return { title: state, description, image: `/juegos/${game.id}/og.png${imageQuery(lang)}`, imageAlt: `${state}. ${description}` }
}

function GamePage() {
  const { game, editions, steam_app_id: steamAppId, summary, steam_deck, timeline, as_of, follow, protondb, anticheat, demo, pending, profiles, causes, diagnostic, personal } =
    Route.useLoaderData()
  const { visitor, origin } = Route.useRouteContext()
  const t = useT()
  const lang = useLang()
  const g = t.game
  const reportLink = (
    <Link to="/$lang/juegos/$gameId/reportar" params={{ lang, gameId: game.id }} className="button">
      {g.report}
    </Link>
  )
  return (
    <main className="wrapper">
      <header className="game-page-banner">
        <Artwork title={game.title} width={1320} height={420} />
        <div className="game-page-banner-text">
          <nav className="breadcrumbs" aria-label={g.breadcrumbs}>
            <Link to="/$lang" params={{ lang }}>
              {g.catalog}
            </Link>{' '}
            / {game.title}
          </nav>
          <h1 className="game-page-title">{game.title}</h1>
          <div className="row" aria-label={g.editions}>
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
            <span>{game.apis.length === 0 ? g.noApis : g.graphics(game.apis.map((api) => graphicsApi[api]).join(' · '))}</span>
            {game.x86_level_min !== null && <span>{g.minimumCpu(x86Level[game.x86_level_min])}</span>}
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
          {summary.test_count > 0 && <ScopedStatus label={g.steamDeck} summary={steam_deck} none={g.noSteamDeck} />}
        </GameStatus>
        <VerdictForMe personal={personal}>
          {diagnostic && (
<p className="small muted">{g.latestDiagnosis(diagnostic.machine, t.date(diagnostic.captured_at))}</p>
          )}
        </VerdictForMe>
      </div>

      <section className="section" aria-labelledby="setups">
        <h2 id="setups">{g.setups.heading}</h2>
        <p className="muted">{g.setups.intro}</p>
        <EnvironmentMatrix setups={summary.setups} myDistribution={diagnostic?.distribution_id ?? null} />
      </section>

      {timeline.length > 0 && (
        <section className="section" aria-labelledby="history">
          <h2 id="history">{g.history.heading}</h2>
          <p className="muted">{g.history.intro}</p>
          <LayerTimeline history={timeline} />
        </section>
      )}

      <section className="section" aria-labelledby="protondb">
        <h2 id="protondb">{t.sources.protondb.heading}</h2>
        <ProtonDbSection protondb={protondb} />
      </section>

      <section className="section" aria-labelledby="anticheat">
        <h2 id="anticheat">{t.sources.anticheat.heading}</h2>
        <AntiCheatSection anticheat={anticheat} />
      </section>

      <div className="section columns-2">
        <section aria-labelledby="profiles">
          <h2 id="profiles">{g.profiles.heading}</h2>
          {profiles.length === 0 ? (
            <p className="card muted">{g.profiles.none}</p>
          ) : (
            <ul className="card-list">
              {profiles.map((p) => (
                <li key={p.id} className="card stack">
                  <div className="row">
                    <Link to="/$lang/perfiles/$profileId" params={{ lang, profileId: p.id }} className="game-name">
                      {p.title} r{p.revision}
                    </Link>
                    {p.review_status === 'pendiente' && <Chip tone="gris">{g.profiles.testing}</Chip>}
                  </div>
                  <div className="chip-row">
                    <span className="chip">{p.launcher}</span>
                    <span className="chip">{p.distribution}</span>
                    <span className="chip">{p.layer}</span>
                    <span className="chip">{p.architecture}</span>
                    {p.demo && <DemoStamp />}
                  </div>
                  {p.review_status === 'pendiente' ? (
                    <p className="small muted">{g.profiles.pending}</p>
                  ) : (
                    p.evaluation && (
                      <div className="row small">
                        <span>{g.profiles.yourMachine}</span>
                        <Badge label={t.requirementsVerdict[p.evaluation.verdict]} shape="punteado" />
                      </div>
                    )
                  )}
                </li>
              ))}
            </ul>
          )}
          <p className="small block">
            <Link to="/$lang/juegos/$gameId/perfiles/nuevo" params={{ lang, gameId: game.id }}>
              {g.profiles.propose}
            </Link>
          </p>
        </section>

        <section aria-labelledby="causes">
          <h2 id="causes">{g.causes.heading}</h2>
          {causes.length === 0 ? (
            <p className="card muted">{g.causes.none}</p>
          ) : (
            <ul className="card-list">
              {causes.map((c) => {
                const label = t.failureType(c.code)
                return (
                  <li key={c.code} className="card stack">
                    <div className="row">
                      <Chip tone={label.tone}>{label.text}</Chip>
                      <span className="small muted">{t.approvedReports(c.reports)}</span>
                    </div>
                    {c.description && <p>{c.description}</p>}
                    {c.solutions.length === 0 ? (
                      <p className="small muted">{g.causes.noSolutions}</p>
                    ) : (
                      c.solutions.map((s) => (
                        <div key={s.id} className="solution stack">
                          <div className="row">
                            <b>{s.title}</b>
                            {s.demo && <DemoStamp />}
                          </div>
                          <p className="long-text small">{s.instructions}</p>
                          <p className="small muted">{g.causes.by(s.author, s.profile)}</p>
                        </div>
                      ))
                    )}
                    {c.reply !== null && (
                      <p className="small">
                        <Link
                          to="/$lang/reportes/$reportId/solucion"
                          params={{ lang, reportId: c.reply.report_id }}
                          search={{ tipoFallo: c.reply.failure_type_id }}
                        >
                          {g.causes.propose}
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

      <section className="section" aria-labelledby="share">
        <h2 id="share">{t.share.embed.heading}</h2>
        <p className="muted">{t.share.embed.intro}</p>
        <Embed origin={origin} game={game} status={summary.status} demo={demo} />
      </section>

      <section className="report" aria-labelledby="report">
        <div className="report-text">
          <h2 id="report">{g.played.heading}</h2>
          <p className="muted">{g.played.intro}</p>
          {steamAppId !== null && (
            <div className="stack report-detector">
              <p className="small">{g.played.detector}</p>
              <CopyBox label={g.played.detectorLabel} text={`curl -fsSL ${origin}/opengame-detect.sh | bash -s -- --game ${steamAppId}`} />
              <p className="small muted">{g.played.noWindows}</p>
            </div>
          )}
        </div>
        {reportLink}
      </section>
    </main>
  )
}
