// `$gameId_` keeps this page out of the game page's layout (it renders on its own).
import { createFileRoute, Link, redirect } from '@tanstack/react-router'
import { Schema } from 'effect'
import { useEffect, useRef, useState } from 'react'
import { mismatches, NewReport } from '../../../domain/contributions.ts'
import { type Encoded, mismatchField, type IncomparableProfile, type RuleViolated } from '../../../domain/errors.ts'
import { LayerFamily, requiresFailure, Outcome } from '../../../domain/literals.ts'
import { DiagnosticId, EditionId, GameId, ProfileId, type ReportId } from '../../../domain/ids.ts'
import { type LayerPrefill, prefillLayer, SteamGame } from '../../../domain/steam-game.ts'
import { protonReportPossible } from '../../../domain/upstream.ts'
import { reportOptionsFn, submitReportFn } from '../../../fns/contributions.ts'
import { FieldError } from '../../../ui/FieldError.tsx'
import { Field, fieldProps, OptionalGroup, nullText } from '../../../ui/form.tsx'
import type { Messages } from '../../../ui/i18n/es.ts'
import { useLang, useT } from '../../../ui/i18n/messages.ts'
import { ruleErrors, type FieldErrors, useAction } from '../../../ui/useAction.ts'
import { titled } from '../../-head.ts'
import { routeIdParser } from '../../-ids.ts'
import { returnHere } from '../../-return-to.ts'

const gameId = routeIdParser(GameId)

export const Route = createFileRoute('/$lang/juegos/$gameId_/reportar')({
  params: { parse: (p) => ({ gameId: gameId(p.gameId) }), stringify: (p) => ({ gameId: String(p.gameId) }) },
  // The router already parses `?perfil=7` into a number. The detector's report mode (`--game`) lands here from
  // /diagnostico/importar with the diagnosis it just saved, the Steam edition and what it read from Steam.
  validateSearch: Schema.toStandardSchemaV1(
    Schema.Struct({
      perfil: Schema.optionalKey(ProfileId),
      diagnostico: Schema.optionalKey(DiagnosticId),
      edicion: Schema.optionalKey(EditionId),
      steam: Schema.optionalKey(SteamGame),
    }),
  ),
  beforeLoad: ({ context, location, params }) => {
    if (context.visitor === null) throw redirect({ to: '/$lang/entrar', params: { lang: params.lang }, search: returnHere(location) })
  },
  loaderDeps: ({ search }) => ({ perfil: search.perfil ?? null }),
  loader: ({ params, deps }) => reportOptionsFn({ data: { gameId: params.gameId, perfil: deps.perfil } }),
  head: ({ loaderData, params }) => titled(params.lang, (t) => t.report.form.title(loaderData?.game.title ?? null)),
  component: ReportPage,
})

type Options = Awaited<ReturnType<typeof reportOptionsFn>>
type Submitted = { readonly id: ReportId; readonly hasFailures: boolean; readonly proton: boolean }

function ReportPage() {
  const options = Route.useLoaderData()
  const [submitted, setSubmitted] = useState<Submitted | null>(null)
  const { game } = options
  const t = useT()
  const lang = useLang()
  const f = t.report.form

  return (
    <main className="wrapper">
      <p className="caption">{f.caption}</p>
      <h1>{game.title}</h1>
      {submitted !== null ? (
        <section className="card stack" aria-live="polite">
          <h2>{f.sent.heading}</h2>
          <p>{f.sent.pending}</p>
          <p className="row">
            <Link to="/$lang/juegos/$gameId" params={{ lang, gameId: game.id }}>
              {t.report.backToGame}
            </Link>
            {submitted.hasFailures && (
              <Link to="/$lang/reportes/$reportId/solucion" params={{ lang, reportId: submitted.id }}>
                {f.sent.proposeSolution}
              </Link>
            )}
            {submitted.proton && (
              <Link to="/$lang/reportes/$reportId/proton" params={{ lang, reportId: submitted.id }}>
                {f.sent.valveReport}
              </Link>
            )}
            <button type="button" className="button-secondary" onClick={() => setSubmitted(null)}>
              {f.sent.another}
            </button>
          </p>
        </section>
      ) : options.diagnostics.length === 0 ? (
        <section className="card note stack">
          <p>{f.needsDiagnosis}</p>
          <p>
            <Link to="/$lang/diagnostico" params={{ lang }}>
              {f.makeDiagnosis}
            </Link>
          </p>
        </section>
      ) : (
        <ReportForm options={options} onSubmitted={setSubmitted} />
      )}
    </main>
  )
}

const byId = <I extends number>(list: ReadonlyArray<{ readonly id: I }>, value: string) => list.find((x) => String(x.id) === value)?.id

const mismatchNames = (o: Options, t: Messages) => {
  const other = t.report.form.other
  const distributions = new Map<number, string>([
    ...o.profiles.map((p) => [p.distribution_id, p.distribution] as const),
    ...o.diagnostics.map((d) => [d.distribution_id, d.distribution] as const),
  ])
  const layerName = (id: number) => {
    const c = o.layers.find((x) => x.id === id)
    return c === undefined ? other.layer : `${c.family} ${c.variant} ${c.version}`
  }
  return (d: Encoded<IncomparableProfile>['mismatches'][number]): readonly [string, string] => {
    switch (d.aspect) {
      case 'edicion':
        return [o.editions.find((e) => e.id === d.expected)?.launcher ?? other.edition, o.editions.find((e) => e.id === d.actual)?.launcher ?? other.edition]
      case 'capa':
        return [layerName(d.expected), layerName(d.actual)]
      case 'distribucion':
        return [distributions.get(d.expected) ?? other.distribution, distributions.get(d.actual) ?? other.distribution]
      case 'arquitectura':
      case 'version_juego':
        return [d.expected, d.actual]
    }
  }
}

// A datetime-local value in the browser's zone, rounded up to the minute so it is never before `date`.
const minuteInput = (date: Date) => {
  const minute = Math.ceil(date.getTime() / 60_000) * 60_000
  return new Date(minute - new Date(minute).getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}

function ReportForm({ options, onSubmitted }: { options: Options; onSubmitted: (submitted: Submitted) => void }) {
  const { diagnostics, editions, layers, profiles, failureTypes, selectedProfile } = options
  const t = useT()
  const f = t.report.form
  const selected = profiles.find((p) => p.id === selectedProfile)
  const search = Route.useSearch()
  const steam = search.steam ?? null
  const detected = steam === null ? null : prefillLayer(steam, layers)
  const startLayer: LayerPrefill | null = selected === undefined ? detected : { _tag: 'existente', id: selected.layer_version_id }
  const reportedDiagnostic = diagnostics.find((d) => d.id === search.diagnostico)

  const [diagnosticId, setDiagnosticId] = useState((reportedDiagnostic ?? diagnostics.at(0))?.id)
  const [editionId, setEditionId] = useState(selected?.edition_id ?? editions.find((e) => e.id === search.edicion)?.id ?? editions.at(0)?.id)
  const [layerType, setLayerType] = useState<'existente' | 'nueva'>(startLayer?._tag ?? 'existente')
  const [layerId, setLayerId] = useState(startLayer?._tag === 'existente' ? startLayer.id : layers.at(0)?.id)
  const [newLayer, setNewLayer] = useState<{ readonly family: LayerFamily; readonly variant: string }>(
    startLayer?._tag === 'nueva' ? { family: startLayer.family, variant: startLayer.variant } : { family: 'Wine', variant: '' },
  )
  const [gameVersion, setGameVersion] = useState(selected?.target_game_version ?? steam?.build_id ?? '')
  const [profileId, setProfileId] = useState(selected === undefined ? nullText : String(selected.id))
  const [outcome, setOutcome] = useState<Outcome>('funciona')
  const [failures, setFailures] = useState<ReadonlyArray<number>>([])
  const [nextFailure, setNextFailure] = useState(0)

  const diagnostic = diagnostics.find((d) => d.id === diagnosticId)
  const testRun =
    diagnostic !== undefined && editionId !== undefined && layerId !== undefined && layerType === 'existente'
      ? { edition_id: editionId, layer_version_id: layerId, distribution_id: diagnostic.distribution_id, architecture: diagnostic.architecture, game_version: gameVersion.trim() }
      : null
  const comparable = profiles.filter((p) => p.id === selectedProfile || (testRun !== null && mismatches(testRun, p).length === 0))
  const profileValue = comparable.some((p) => String(p.id) === profileId) ? profileId : nullText

  const r = useAction(NewReport, submitReportFn, {
    onFailure: (failure: Encoded<RuleViolated | IncomparableProfile>): FieldErrors => {
      switch (failure._tag) {
        case 'ReglaIncumplida':
          return ruleErrors(failure, t)
        case 'PerfilNoComparable': {
          const nameOf = mismatchNames(options, t)
          const errors: Record<string, string> = {}
          for (const d of failure.mismatches) {
            const c = mismatchField[d.aspect]
            errors[c] = [errors[c], t.mismatches[d.aspect](...nameOf(d))].filter((m) => m !== undefined).join(' ')
          }
          return errors
        }
      }
    },
    onComplete: (v) => {
      const layer = layerType === 'existente' ? layers.find((c) => c.id === layerId) : newLayer
      const launcher = editions.find((e) => e.id === editionId)?.launcher
      const proton = layer !== undefined && launcher !== undefined && protonReportPossible({ launcher, family: layer.family, variant: layer.variant.trim(), outcome })
      onSubmitted({ id: v.id, hasFailures: failures.length > 0, proton })
    },
  })

  const addFailure = () => {
    setFailures([...failures, nextFailure])
    setNextFailure(nextFailure + 1)
  }

  // The detector ran after the game was played, and a report cannot predate its diagnosis, so report mode starts
  // the test time at the capture. Set after hydration: the value depends on the browser's zone.
  const testedAt = useRef<HTMLInputElement>(null)
  const capturedAt = reportedDiagnostic?.captured_at
  useEffect(() => {
    if (capturedAt !== undefined && testedAt.current !== null && testedAt.current.value === '') testedAt.current.value = minuteInput(capturedAt)
  }, [capturedAt])

  return (
    <form className="card form form-wide" {...r.form}>
      <FieldError errors={r.errors} field="form" />
      {steam !== null && <DetectedNote steam={steam} layer={detected} testedAt={reportedDiagnostic !== undefined} />}

      <h2 className="section-title">{f.where}</h2>
      <Field errors={r.errors} name="diagnostic_id" label={f.diagnostic.label} help={f.diagnostic.help}>
        <select {...fieldProps(r.errors, 'diagnostic_id')} value={diagnosticId ?? ''} onChange={(e) => setDiagnosticId(byId(diagnostics, e.currentTarget.value))}>
          {diagnostics.map((d) => (
            <option key={d.id} value={d.id}>
              {d.machine} · {d.distribution} · {d.architecture} · {t.dateTime(d.captured_at)}
            </option>
          ))}
        </select>
      </Field>
      <Field errors={r.errors} name="edition_id" label={f.edition}>
        <select {...fieldProps(r.errors, 'edition_id')} value={editionId ?? ''} onChange={(e) => setEditionId(byId(editions, e.currentTarget.value))}>
          {editions.map((e) => (
            <option key={e.id} value={e.id}>
              {e.launcher}
            </option>
          ))}
        </select>
      </Field>

      <fieldset className="group">
        <legend>{f.layer.legend}</legend>
        <div className="row">
          <label className="checkbox">
            <input type="radio" name="layer_version[_tag]" value="existente" checked={layerType === 'existente'} onChange={() => setLayerType('existente')} />
            {f.layer.listed}
          </label>
          <label className="checkbox">
            <input type="radio" name="layer_version[_tag]" value="nueva" checked={layerType === 'nueva'} onChange={() => setLayerType('nueva')} />
            {f.layer.other}
          </label>
        </div>
        {layerType === 'existente' ? (
          <Field errors={r.errors} name="layer_version[id]" label={f.layer.version}>
            <select {...fieldProps(r.errors, 'layer_version[id]')} value={layerId ?? ''} onChange={(e) => setLayerId(byId(layers, e.currentTarget.value))}>
              {layers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.family} {c.variant} {c.version}
                </option>
              ))}
            </select>
          </Field>
        ) : (
          <div className="row inline-fields">
            <Field errors={r.errors} name="layer_version[family]" label={f.layer.family}>
              <select
                {...fieldProps(r.errors, 'layer_version[family]')}
                value={newLayer.family}
                onChange={(e) => setNewLayer({ ...newLayer, family: LayerFamily.literals.find((family) => family === e.currentTarget.value) ?? newLayer.family })}
              >
                {LayerFamily.literals.map((family) => (
                  <option key={family}>{family}</option>
                ))}
              </select>
            </Field>
            <Field errors={r.errors} name="layer_version[variant]" label={f.layer.variant}>
              <input
                {...fieldProps(r.errors, 'layer_version[variant]')}
                value={newLayer.variant}
                onChange={(e) => setNewLayer({ ...newLayer, variant: e.currentTarget.value })}
                placeholder="GE"
              />
            </Field>
            <Field errors={r.errors} name="layer_version[version]" label={f.layer.exactVersion}>
              <input {...fieldProps(r.errors, 'layer_version[version]')} defaultValue={startLayer?._tag === 'nueva' ? startLayer.version : undefined} placeholder="9-20" />
            </Field>
          </div>
        )}
        <FieldError errors={r.errors} field="layer_version" />
      </fieldset>

      <div className="row inline-fields">
        <Field errors={r.errors} name="game_version" label={f.gameVersion}>
          <input {...fieldProps(r.errors, 'game_version')} value={gameVersion} onChange={(e) => setGameVersion(e.currentTarget.value)} placeholder="1.0.3179" />
        </Field>
        <Field errors={r.errors} name="launcher_version" label={f.launcherVersion}>
          <input {...fieldProps(r.errors, 'launcher_version')} />
        </Field>
      </div>

      <Field errors={r.errors} name="profile_id" label={f.profile.label} help={f.profile.help}>
        <select {...fieldProps(r.errors, 'profile_id')} value={profileValue} onChange={(e) => setProfileId(e.currentTarget.value)}>
          <option value={nullText}>{f.profile.none}</option>
          {comparable.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title} (r{p.revision}, {t.reviewStatus[p.review_status].text.toLowerCase()}) · {p.distribution}
            </option>
          ))}
        </select>
      </Field>

      <h2 className="section-title">{f.what}</h2>
      <Field errors={r.errors} name="tested_at" label={f.testedAt}>
        <input {...fieldProps(r.errors, 'tested_at')} ref={testedAt} type="datetime-local" />
      </Field>
      <fieldset className="group">
        <legend>{f.outcome}</legend>
        <div className="row">
          {Outcome.literals.map((value) => (
            <label key={value} className="checkbox">
              <input type="radio" name="outcome" value={value} checked={outcome === value} onChange={() => setOutcome(value)} />
              {t.outcome[value].text}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="group">
        <legend>{f.failures.legend}</legend>
        <p className="small muted">{requiresFailure[outcome] ? f.failures.required : f.failures.optional}</p>
        {failures.map((key, i) => (
          <div key={key} className="row inline-fields">
            <Field errors={r.errors} name={`failures[${i}][failure_type_id]`} label={f.failures.type}>
              <select {...fieldProps(r.errors, `failures[${i}][failure_type_id]`)}>
                {failureTypes.map((type) => (
                  <option key={type.id} value={type.id} title={type.description}>
                    {t.failureType(type.code).text}
                  </option>
                ))}
              </select>
            </Field>
            <Field errors={r.errors} name={`failures[${i}][detail]`} label={f.failures.detail}>
              <input {...fieldProps(r.errors, `failures[${i}][detail]`)} />
            </Field>
            <button type="button" className="button-secondary" onClick={() => setFailures(failures.filter((k) => k !== key))}>
              {f.failures.remove}
            </button>
          </div>
        ))}
        <p>
          <button type="button" className="button-secondary" onClick={addFailure}>
            {f.failures.add}
          </button>
        </p>
        <FieldError errors={r.errors} field="failures" />
      </fieldset>

      <OptionalGroup name="measurement" label={f.measurement.label}>
        <p className="small muted">{f.measurement.note}</p>
        <div className="row inline-fields">
          <Field errors={r.errors} name="measurement[avg_fps]" label={f.measurement.avgFps}>
            <input {...fieldProps(r.errors, 'measurement[avg_fps]')} type="number" inputMode="decimal" min="0" step="0.01" />
          </Field>
          <Field errors={r.errors} name="measurement[resolution]" label={f.measurement.resolution}>
            <input {...fieldProps(r.errors, 'measurement[resolution]')} placeholder="1920x1080" />
          </Field>
          <Field errors={r.errors} name="measurement[graphics_quality]" label={f.measurement.quality}>
            <input {...fieldProps(r.errors, 'measurement[graphics_quality]')} placeholder={f.measurement.qualityExample} />
          </Field>
        </div>
        <Field errors={r.errors} name="measurement[measurement_method]" label={f.measurement.method}>
          <input {...fieldProps(r.errors, 'measurement[measurement_method]')} placeholder={f.measurement.methodExample} />
        </Field>
      </OptionalGroup>

      <Field errors={r.errors} name="observations" label={f.observations.label} help={f.observations.help}>
        <textarea
          {...fieldProps(r.errors, 'observations')}
          rows={4}
          defaultValue={steam?.launch_options ? f.observations.launchOptions(steam.launch_options) : undefined}
        />
      </Field>

      <button type="submit" disabled={r.submitting}>
        {r.submitting ? t.report.sending : f.submit}
      </button>
    </form>
  )
}

const layerNote = (steam: SteamGame, layer: LayerPrefill | null, n: Messages['report']['detected']) => {
  if (steam.tool === null) return steam.native ? n.native : n.unknownTool
  const tool = n.tool(steam.tool, steam.tool_version === null || steam.tool_version === steam.tool ? null : steam.tool_version)
  if (layer === null) return n.untranslatable(tool)
  if (layer._tag === 'existente') return n.listed(tool)
  if (layer.version === '') return n.noVersion(tool)
  return n.unlisted(tool)
}

/** What report mode filled in from the detector, so the user knows what to check before sending. */
function DetectedNote({ steam, layer, testedAt }: { steam: SteamGame; layer: LayerPrefill | null; testedAt: boolean }) {
  const n = useT().report.detected
  return (
    <section className="note stack" data-tone="azul" aria-label={n.label}>
      <p>{n.intro}</p>
      <ul className="small">
        <li>{n.layer(layerNote(steam, layer, n))}</li>
        {steam.build_id !== null && <li>{n.build(steam.build_id)}</li>}
        {steam.launch_options !== null && (
          <li>
            {n.launchOptions}
            {steam.guessed_account && n.guessedAccount}
          </li>
        )}
        {testedAt && <li>{n.testedAt}</li>}
      </ul>
    </section>
  )
}
