import { createFileRoute, Link } from '@tanstack/react-router'
import { ProfileId } from '../../../domain/ids.ts'
import { canReview } from '../../../domain/review.ts'
import { profileFn } from '../../../fns/catalog.ts'
import { CopyBox } from '../../../ui/compatibility/CopyBox.tsx'
import { EvaluationChecklist } from '../../../ui/compatibility/EvaluationChecklist.tsx'
import { MachinePanel } from '../../../ui/compatibility/VerdictForMe.tsx'
import { memory } from '../../../ui/format.ts'
import { Chip, Badge } from '../../../ui/Badge.tsx'
import { useProgress } from '../../../ui/progress.ts'
import { DemoStamp } from '../../../ui/DemoStamp.tsx'
import { messages, useLang, useT } from '../../../ui/i18n/messages.ts'
import { routeIdParser } from '../../-ids.ts'
import { ShareUpstream } from './-upstream.tsx'

const profileId = routeIdParser(ProfileId)

export const Route = createFileRoute('/$lang/perfiles/$profileId')({
  params: { parse: (p) => ({ profileId: profileId(p.profileId) }), stringify: (p) => ({ profileId: String(p.profileId) }) },
  loader: ({ params }) => profileFn({ data: params }),
  head: ({ loaderData, params }) => ({ meta: [{ title: loaderData ? messages[params.lang].title(loaderData.profile.title) : 'OpenGame Linux' }] }),
  component: ProfilePage,
})

function ProfilePage() {
  const { profile: p, steps, dependencies, evaluation, fixExport, fixes } = Route.useLoaderData()
  const { visitor } = Route.useRouteContext()
  const t = useT()
  const lang = useLang()
  const page = t.profile.page
  const approved = p.review_status === 'aprobado'
  const undeclared = <span className="muted">{page.undeclared}</span>
  return (
    <main className="wrapper">
      <header className="stack">
        <div className="breadcrumbs">
          <Link to="/$lang" params={{ lang }}>{page.catalog}</Link> / <Link to="/$lang/juegos/$gameId" params={{ lang, gameId: p.game_id }}>{p.game}</Link> /{' '}
          {t.profile.breadcrumb}
        </div>
        <h1 className="game-title">
          {p.title} <span className="muted">r{p.revision}</span>
        </h1>
        <div className="row">
          {approved ? <Badge label={t.reviewStatus.aprobado} /> : <Chip tone="gris">{page.testing}</Chip>}
          <span className="small muted">
            {approved && p.reviewed_at ? page.approvedOn(t.date(p.reviewed_at)) : t.reviewStatus.pendiente.text} · {page.author(p.author)}
          </span>
          {p.demo && <DemoStamp />}
        </div>
        <div className="chip-row">
          <span className="chip">{p.launcher}</span>
          <span className="chip">{p.distribution}</span>
          <span className="chip">{p.layer}</span>
          <span className="chip">{p.architecture}</span>
          {p.target_game_version && <span className="chip">{page.gameVersion(p.target_game_version)}</span>}
        </div>
        {!approved && (
          <p className="small note" data-tone="amarillo">
            {page.unapproved}
          </p>
        )}
        <p className="small note" data-tone="azul">
          {page.nothingRuns}
        </p>
        {p.editable && (
          <p className="small note" data-tone="morado">
            {page.yours}
          </p>
        )}
        <p className="row">
          <Link to="/$lang/juegos/$gameId/reportar" params={{ lang, gameId: p.game_id }} search={{ perfil: p.id }} className="button">
            {page.report}
          </Link>
          {p.editable ? (
            <Link to="/$lang/perfiles/$profileId/editar" params={{ lang, profileId: p.id }} className="button-secondary">
              {t.profile.editProposal}
            </Link>
          ) : (
            <Link to="/$lang/juegos/$gameId/perfiles/nuevo" params={{ lang, gameId: p.game_id }} search={{ desde: p.id }} className="button-secondary">
              {t.profile.newVersion}
            </Link>
          )}
        </p>
      </header>

      <div className="grid-2">
        <div>
          <h2 className="section-title">{t.profile.steps}</h2>
          {steps.length === 0 ? (
            <p className="card muted">{page.noSteps}</p>
          ) : (
            <StepList storageKey={`opengame:perfil:${p.id}:r${p.revision}:pasos`} steps={steps} />
          )}
          {p.launch_options && (
            <div className="block">
              <CopyBox label={page.launchOptions} text={p.launch_options} />
            </div>
          )}
          <h2 className="section-title">{t.profile.dependencies}</h2>
          {dependencies.length === 0 ? (
            <p className="card muted">{page.noDependencies}</p>
          ) : (
            <ul className="card-list">
              {dependencies.map((d) => (
                <li key={`${d.package_manager}/${d.name}`} className="card stack">
                  <div className="row">
                    <b className="datum">{d.name}</b>
                    <span className="chip">{d.package_manager}</span>
                    <Chip tone={d.required ? 'amarillo' : 'gris'}>{d.required ? page.required : page.optional}</Chip>
                    {d.required_version && <span className="chip">{page.version(d.required_version)}</span>}
                  </div>
                  <p className="small muted">{d.description}</p>
                  <CopyBox label={page.install(d.name)} text={d.install_instruction} />
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <h2 className="section-title">{t.profile.requirements}</h2>
          <div className="card">
            <table className="checklist">
              <caption className="sr-only">{page.requirementsCaption}</caption>
              <tbody>
                <tr>
                  <th scope="row">{t.profile.ramMin}</th>
                  <td>{p.ram_min_mb === null ? undeclared : memory(p.ram_min_mb)}</td>
                </tr>
                <tr>
                  <th scope="row">{t.profile.vramMin}</th>
                  <td>{p.vram_min_mb === null ? undeclared : memory(p.vram_min_mb)}</td>
                </tr>
                <tr>
                  <th scope="row">Vulkan</th>
                  <td>
                    {p.requires_vulkan === null ? undeclared : p.requires_vulkan ? page.vulkanRequired(p.vulkan_version_min) : page.vulkanNotNeeded}
                  </td>
                </tr>
                <tr>
                  <th scope="row">CPU</th>
                  <td>{p.cpu_requirement ?? undeclared}</td>
                </tr>
                <tr>
                  <th scope="row">GPU</th>
                  <td>{p.gpu_requirement ?? undeclared}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="block">
            <MachinePanel>
              {typeof evaluation === 'string' ? (
                <p className="small muted">{page.noEvaluation[evaluation]}</p>
              ) : (
                <EvaluationChecklist profile={{ title: p.title, revision: p.revision, evaluation }} />
              )}
            </MachinePanel>
          </div>
        </div>
      </div>

      {fixExport !== null && (
        <ShareUpstream
          profileId={p.id}
          fixExport={fixExport}
          fixes={fixes}
          reviewer={visitor !== null && canReview[visitor.role]}
        />
      )}
    </main>
  )
}

type Step = Awaited<ReturnType<typeof profileFn>>['steps'][number]

function StepList({ storageKey, steps }: { storageKey: string; steps: ReadonlyArray<Step> }) {
  const { done, toggle, reset } = useProgress(storageKey)
  const page = useT().profile.page
  const doneCount = steps.filter((s) => done.includes(s.position)).length
  return (
    <>
      <div className="row small">
        <span className="muted" aria-live="polite">
          {page.progress(doneCount, steps.length)}
        </span>
        {doneCount > 0 && (
          <button type="button" className="button-secondary" onClick={reset}>
            {page.reset}
          </button>
        )}
      </div>
      <ol className="steps">
        {steps.map((s) => (
          <li key={s.position} className="card stack" data-done={done.includes(s.position) || undefined}>
            <b>{s.title}</b>
            <p className="long-text">{s.instruction}</p>
            <label className="checkbox small">
              <input type="checkbox" checked={done.includes(s.position)} onChange={() => toggle(s.position)} />
              {page.done}
            </label>
          </li>
        ))}
      </ol>
    </>
  )
}
