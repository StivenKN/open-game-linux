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
import { useAction } from '../../../ui/useAction.ts'
import { payloadReason } from '../../../ui/vocabulary.ts'
import { type Input, savePending, readPending, forgetPending } from './-input.ts'

export const Route = createFileRoute('/$lang/diagnostico/importar')({
  ssr: false,
  head: () => ({ meta: [{ title: 'Tu diagnóstico · OpenGame Linux' }] }),
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
        <h1>No hay un diagnóstico para mostrar</h1>
        <p className="muted">
          Ejecuta el detector con <code>--open</code>, o pega su salida en <Link to="/diagnostico">Diagnóstico</Link>.
        </p>
      </main>
    )
  if (state === null || state.evaluated === null)
    return (
      <main className="wrapper">
        <p role="status">Leyendo tu equipo…</p>
      </main>
    )
  const r = state.evaluated
  if (!r.ok)
    return (
      <main className="wrapper stack">
        <h1>No pudimos leer este diagnóstico</h1>
        <p role="alert">
          {payloadReason[r.error.reason]}
          {r.error.field !== null && <span className="datum"> ({r.error.field})</span>}
        </p>
        <Link to="/diagnostico">Volver a Diagnóstico</Link>
      </main>
    )
  const { capture, report } = r.value
  const steam = capture.operating_system === 'Linux' ? capture.steam_game : null
  return (
    <main className="wrapper stack">
      <h1>Tu equipo frente al catálogo</h1>
      <p className="muted">
        Esta evaluación no se ha guardado. Compara RAM, VRAM y Vulkan con el perfil aprobado sugerido para cada juego; no
        predice FPS.
      </p>
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
  if (title === null)
    return (
      <p className="note" data-tone="amarillo">
        El juego {steam.app_id} de Steam todavía no está en el catálogo, así que no hay un formulario de reporte que llenar. Puedes
        guardar el diagnóstico igual.
      </p>
    )
  return (
    <section className="note stack" data-tone="azul" aria-labelledby="report-mode">
      <h2 id="report-mode" className="no-margin">
        Reportar {title}
      </h2>
      <p>
        El detector leyó cómo ejecuta Steam este juego:{' '}
        {steam.tool !== null ? `«${steam.tool_version ?? steam.tool}»` : steam.native ? 'sin herramienta de compatibilidad (nativo)' : 'sin saber con qué herramienta'}
        {steam.launch_options !== null && <>, con las opciones de lanzamiento «{steam.launch_options}»</>}
        {steam.build_id !== null && <>, build {steam.build_id}</>}. Guarda este diagnóstico y te llevamos al formulario del reporte ya
        lleno. Nada se envía hasta que lo revises.
      </p>
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
  const [target, setTarget] = useState(() => (machines[0] === undefined ? 'nuevo' : String(machines[0].id)))
  const [saved, setSaved] = useState<Saved | null>(null)
  const r = useAction(SaveTarget, ({ data }) => saveDiagnosticFn({ data: { ...data, input } }), {
    onFailure: (f) =>
      f._tag === 'ReglaIncumplida'
        ? { 'machine[id]': 'Ese equipo no es tuyo. Elige uno de tu lista.' }
        : { form: payloadReason[f.reason] },
    onComplete: (value) => {
      forgetPending()
      setSaved(value)
      if (report !== null)
        void navigate({
          to: '/juegos/$gameId/reportar',
          params: { gameId: report.gameId },
          search: { diagnostico: value.id, edicion: report.editionId, steam: report.steam },
        })
    },
  })

  if (visitor === null)
    return (
      <section className="card row" aria-label="Guardar">
        <span>
          {report === null
            ? 'Para guardar este diagnóstico en tu equipo necesitas una cuenta.'
            : 'Para reportar necesitas una cuenta. Tu diagnóstico te espera aquí al volver.'}
        </span>
        <Link to="/entrar" search={{ volver: '/diagnostico/importar' }} className="button">
          {report === null ? 'Entrar para guardar' : 'Entrar para reportar'}
        </Link>
        <Link to="/registro" search={{ volver: '/diagnostico/importar' }}>
          Crear cuenta
        </Link>
      </section>
    )

  return (
    <section className="card" aria-label="Guardar">
      <form className="stack" {...r.form}>
        <div className="row">
          <input type="hidden" name="machine[_tag]" value={target === 'nuevo' ? 'nuevo' : 'existente'} />
          <label htmlFor="machine[id]">Guardar en</label>
          <select {...fieldProps(r.errors, 'machine[id]')} value={target} onChange={(e) => setTarget(e.currentTarget.value)}>
            {machines.map((e) => (
              <option key={e.id} value={e.id}>
                {e.alias}
              </option>
            ))}
            <option value="nuevo">Un equipo nuevo…</option>
          </select>
          {target === 'nuevo' && (
            <input
              {...fieldProps(r.errors, 'machine[alias]')}
              aria-label="Nombre del equipo nuevo"
              defaultValue={machines.length === 0 ? 'Mi equipo' : ''}
              placeholder="Portátil del trabajo"
            />
          )}
          <button type="submit" disabled={r.submitting}>
            {r.submitting ? 'Guardando…' : report === null ? 'Guardar en mi equipo' : 'Guardar y reportar'}
          </button>
        </div>
        {libraryGameCount > 0 && (
          <label className="checkbox">
            <input type="checkbox" name="with_library" value="true" />
            Guardar también mi lista de juegos de Steam ({libraryGameCount}). Solo tú la ves.
          </label>
        )}
      </form>
      <FieldError errors={r.errors} field="machine[id]" />
      <FieldError errors={r.errors} field="machine[alias]" />
      <FieldError errors={r.errors} field="form" />
      {saved && (
        <p role="status" className="small">
          {saved.inserted ? 'Guardado.' : 'Ya estaba guardado; no se creó una copia.'}{' '}
          <Link to="/diagnosticos/$diagnosticId" params={{ diagnosticId: saved.id }}>
            Ver el diagnóstico guardado
          </Link>
        </p>
      )}
    </section>
  )
}
