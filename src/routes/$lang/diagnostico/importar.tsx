import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { Option, Schema } from 'effect'
import { useEffect, useState } from 'react'
import { TargetMachine } from '../../../domain/contributions.ts'
import { Checkbox, type DiagnosticId, type EditionId, type GameId } from '../../../domain/ids.ts'
import type { SteamGame } from '../../../domain/steam-game.ts'
import { evaluateDiagnosticFn, saveDiagnosticFn, myMachinesFn } from '../../../fns/diagnostic.ts'
import { Distributions } from '../../../ui/diagnostics/Distributions.tsx'
import { MachineGames } from '../../../ui/diagnostics/MachineGames.tsx'
import { CaptureSummary } from '../../../ui/diagnostics/CaptureSummary.tsx'
import { GraphicsCardOnLinux } from '../../../ui/diagnostics/GraphicsCardOnLinux.tsx'
import { FieldError } from '../../../ui/FieldError.tsx'
import { fieldProps } from '../../../ui/form.tsx'
import { useLang, useT } from '../../../ui/i18n/messages.ts'
import { useAction } from '../../../ui/useAction.ts'
import { titled } from '../../-head.ts'
import { type Input, savePending, readPending, forgetPending } from './-input.ts'

export const Route = createFileRoute('/$lang/diagnostico/importar')({
  ssr: false,
  head: ({ params }) => titled(params.lang, (t) => t.diagnosis.import.title),
  loader: () => myMachinesFn(),
  component: ImportPage,
})

type Evaluated = Awaited<ReturnType<typeof evaluateDiagnosticFn>>

const takeFragment = () => {
  const { hash, pathname, search } = window.location
  if (!hash.startsWith('#d=')) return
  savePending({ _tag: 'detector', texto: hash.slice('#d='.length) })
  history.replaceState(history.state, '', pathname + search)
}

function ImportPage() {
  const [state, setState] = useState<{ readonly input: Input; readonly evaluated: Evaluated | null } | 'vacio' | null>(null)
  const t = useT()
  const lang = useLang()
  const p = t.diagnosis.import

  useEffect(() => {
    takeFragment()
    const pending = readPending()
    if (Option.isNone(pending)) return setState('vacio')
    const input = pending.value
    setState({ input, evaluated: null })
    void evaluateDiagnosticFn({ data: input }).then((evaluated) => setState({ input, evaluated }))
  }, [])

  if (state === 'vacio')
    return (
      <main className="wrapper stack">
        <h1>{p.empty}</h1>
        <p className="muted">
          {p.emptyHelp(
            <Link to="/$lang/diagnostico" params={{ lang }}>
              {t.diagnosis.title}
            </Link>,
          )}
        </p>
      </main>
    )
  if (state === null || state.evaluated === null)
    return (
      <main className="wrapper">
        <p role="status">{p.reading}</p>
      </main>
    )
  const r = state.evaluated
  if (!r.ok)
    return (
      <main className="wrapper stack">
        <h1>{p.unreadable}</h1>
        <p role="alert">
          {t.payloadReason[r.error.reason]}
          {r.error.field !== null && <span className="datum"> ({r.error.field})</span>}
        </p>
        <Link to="/$lang/diagnostico" params={{ lang }}>
          {p.back}
        </Link>
      </main>
    )
  const { capture, report } = r.value
  const steam = capture.operating_system === 'Linux' ? capture.steam_game : null
  return (
    <main className="wrapper stack">
      <h1>{p.heading}</h1>
      <p className="muted">{p.intro}</p>
      {steam !== null && <ReportIntro steam={steam} title={report?.title ?? null} />}
      <CaptureSummary capture={capture} />
      <GraphicsCardOnLinux machine={r.value.machine} pci={capture.gpu_pci_id} />
      <SavePanel
        input={state.input}
        libraryGameCount={r.value.library?.total ?? 0}
        report={steam === null || report === null ? null : { gameId: report.game_id, editionId: report.edition_id, steam }}
      />
      <MachineGames rows={r.value.matrix} library={r.value.library} approximate={r.value.capture.operating_system === 'Windows'} />
      <Distributions {...r.value.distributions} />
    </main>
  )
}

/** Report mode (`--game`): which game the capture reports, and what the detector read from Steam. */
function ReportIntro({ steam, title }: { steam: SteamGame; title: string | null }) {
  const p = useT().diagnosis.import
  if (title === null)
    return (
      <p className="note" data-tone="amarillo">
        {p.notInCatalog(steam.app_id)}
      </p>
    )
  return (
    <section className="note stack" data-tone="azul" aria-labelledby="report-mode">
      <h2 id="report-mode" className="no-margin">
        {p.report(title)}
      </h2>
      <p>{p.steamRead(steam)}</p>
    </section>
  )
}

const SaveTarget = Schema.Struct({ machine: TargetMachine, with_library: Checkbox })
type Saved = { readonly id: DiagnosticId; readonly inserted: boolean }
type ReportTarget = { readonly gameId: GameId; readonly editionId: EditionId; readonly steam: SteamGame }

function SavePanel({ input, libraryGameCount, report }: { input: Input; libraryGameCount: number; report: ReportTarget | null }) {
  const { visitor } = Route.useRouteContext()
  const machines = Route.useLoaderData()
  const navigate = useNavigate()
  const t = useT()
  const lang = useLang()
  const s = t.diagnosis.save
  const [target, setTarget] = useState(() => (machines[0] === undefined ? 'nuevo' : String(machines[0].id)))
  const [saved, setSaved] = useState<Saved | null>(null)
  const r = useAction(SaveTarget, ({ data }) => saveDiagnosticFn({ data: { ...data, input } }), {
    onFailure: (f, t) => (f._tag === 'ReglaIncumplida' ? { 'machine[id]': t.diagnosis.save.notYours } : { form: t.payloadReason[f.reason] }),
    onComplete: (value) => {
      forgetPending()
      setSaved(value)
      if (report !== null)
        void navigate({
          to: '/$lang/juegos/$gameId/reportar',
          params: { lang, gameId: report.gameId },
          search: { diagnostico: value.id, edicion: report.editionId, steam: report.steam },
        })
    },
  })

  if (visitor === null)
    return (
      <section className="card row" aria-label={s.label}>
        <span>{report === null ? s.needAccount : s.needAccountToReport}</span>
        <Link to="/$lang/entrar" params={{ lang }} search={{ volver: '/diagnostico/importar' }} className="button">
          {report === null ? s.signInToSave : s.signInToReport}
        </Link>
        <Link to="/$lang/registro" params={{ lang }} search={{ volver: '/diagnostico/importar' }}>
          {t.header.signUp}
        </Link>
      </section>
    )

  return (
    <section className="card" aria-label={s.label}>
      <form className="stack" {...r.form}>
        <div className="row">
          <input type="hidden" name="machine[_tag]" value={target === 'nuevo' ? 'nuevo' : 'existente'} />
          <label htmlFor="machine[id]">{s.saveIn}</label>
          <select {...fieldProps(r.errors, 'machine[id]')} value={target} onChange={(e) => setTarget(e.currentTarget.value)}>
            {machines.map((e) => (
              <option key={e.id} value={e.id}>
                {e.alias}
              </option>
            ))}
            <option value="nuevo">{s.newMachine}</option>
          </select>
          {target === 'nuevo' && (
            <input
              {...fieldProps(r.errors, 'machine[alias]')}
              aria-label={s.newMachineName}
              defaultValue={machines.length === 0 ? s.defaultAlias : ''}
              placeholder={s.aliasPlaceholder}
            />
          )}
          <button type="submit" disabled={r.submitting}>
            {r.submitting ? s.saving : report === null ? s.save : s.saveAndReport}
          </button>
        </div>
        {libraryGameCount > 0 && (
          <label className="checkbox">
            <input type="checkbox" name="with_library" value="true" />
            {s.withLibrary(libraryGameCount)}
          </label>
        )}
      </form>
      <FieldError errors={r.errors} field="machine[id]" />
      <FieldError errors={r.errors} field="machine[alias]" />
      <FieldError errors={r.errors} field="form" />
      {saved && (
        <p role="status" className="small">
          {saved.inserted ? s.saved : s.alreadySaved}{' '}
          <Link to="/$lang/diagnosticos/$diagnosticId" params={{ lang, diagnosticId: saved.id }}>
            {s.viewSaved}
          </Link>
        </p>
      )}
    </section>
  )
}
