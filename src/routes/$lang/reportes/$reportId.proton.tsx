import { createFileRoute, Link, redirect } from '@tanstack/react-router'
import { ReportId } from '../../../domain/ids.ts'
import { protonReportFn } from '../../../fns/upstream.ts'
import { CopyBox } from '../../../ui/compatibility/CopyBox.tsx'
import { DemoStamp } from '../../../ui/DemoStamp.tsx'
import { messages, useLang, useT } from '../../../ui/i18n/messages.ts'
import { routeIdParser } from '../../-ids.ts'
import { returnHere } from '../../-return-to.ts'

const reportId = routeIdParser(ReportId)

export const Route = createFileRoute('/$lang/reportes/$reportId/proton')({
  params: { parse: (p) => ({ reportId: reportId(p.reportId) }), stringify: (p) => ({ reportId: String(p.reportId) }) },
  beforeLoad: ({ context, location, params }) => {
    if (context.visitor === null) throw redirect({ to: '/$lang/entrar', params: { lang: params.lang }, search: returnHere(location) })
  },
  loader: ({ params }) => protonReportFn({ data: { reportId: params.reportId } }),
  head: ({ loaderData, params }) => ({ meta: [{ title: messages[params.lang].report.proton.title(loaderData?.report.game ?? 'OpenGame Linux') }] }),
  component: ValveReportPage,
})

// The report's title and body (`x.title`, `x.body`) go to Valve's tracker, so they stay in English in every language.
function ValveReportPage() {
  const { report, protonReport: x } = Route.useLoaderData()
  const t = useT()
  const lang = useLang()
  const p = t.report.proton
  const backLink = (
    <Link to="/$lang/juegos/$gameId" params={{ lang, gameId: report.game_id }}>
      {t.report.backToGame}
    </Link>
  )
  return (
    <main className="wrapper narrow-reading stack">
      <p className="caption">{p.caption}</p>
      <h1>{report.game}</h1>
      {x._tag === 'no_aplica' ? (
        <section className="card stack">
          <p>{t.noReportReason[x.reason]}</p>
          <p>{backLink}</p>
        </section>
      ) : (
        <>
          <p className="muted">{p.private}</p>
          <p>{p.intro}</p>
          <ol className="steps">
            <li className="card stack">
              <b>{p.log.heading}</b>
              <p className="long-text">{p.log.body}</p>
              <CopyBox label={p.log.copy} text={x.log_command} />
            </li>
            <li className="card stack">
              <b>{p.compress.heading}</b>
              <p className="long-text">{p.compress.body}</p>
              <CopyBox label={p.compress.copy} text={x.compress_command} />
            </li>
            <li className="card stack">
              <b>{p.search.heading}</b>
              <p className="long-text">{p.search.body(x.appid)}</p>
              <p>
                <a href={x.search} target="_blank" rel="noreferrer">
                  {p.search.link(x.appid)}
                </a>
              </p>
            </li>
            <li className="card stack">
              <b>{p.open.heading}</b>
              <p className="long-text">{p.open.body(x.appid)}</p>
              <p className="row">
                {x.open._tag === 'enlace' ? (
                  <a className="button" href={x.open.url} target="_blank" rel="noreferrer">
                    {p.open.link}
                  </a>
                ) : (
                  <span className="row small muted">
                    <DemoStamp /> {p.open.demo}
                  </span>
                )}
              </p>
              <p className="small note" data-tone={x.body_in_link ? 'azul' : 'amarillo'}>
                {x.body_in_link ? p.open.bodyInLink : p.open.tooLong}
              </p>
              <CopyBox label={p.open.copy(x.title)} text={x.body} />
            </li>
          </ol>
          <p>{backLink}</p>
        </>
      )}
    </main>
  )
}
