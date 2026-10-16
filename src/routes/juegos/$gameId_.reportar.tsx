// `$gameId_` keeps this page out of the game page's layout (it renders on its own).
import { createFileRoute, Link, redirect } from '@tanstack/react-router'
import { Schema } from 'effect'
import { useState } from 'react'
import { mismatches, NewReport } from '../../domain/contributions.ts'
import { type Encoded, profileMismatches, type IncomparableProfile, type RuleViolated } from '../../domain/errors.ts'
import { LayerFamily, requiresFailure, Outcome } from '../../domain/literals.ts'
import { GameId, ProfileId, type ReportId } from '../../domain/ids.ts'
import { protonReportPossible } from '../../domain/upstream.ts'
import { reportOptionsFn, submitReportFn } from '../../fns/contributions.ts'
import { FieldError } from '../../ui/FieldError.tsx'
import { dateTime } from '../../ui/format.ts'
import { Field, fieldProps, OptionalGroup, nullText } from '../../ui/form.tsx'
import { ruleErrors, type FieldErrors, useAction } from '../../ui/useAction.ts'
import { reviewStatus, outcome as outcomeLabel, failureType } from '../../ui/vocabulary.ts'
import { routeIdParser } from '../-ids.ts'
import { returnHere } from '../-return-to.ts'

const gameId = routeIdParser(GameId)

export const Route = createFileRoute('/juegos/$gameId_/reportar')({
  params: { parse: (p) => ({ gameId: gameId(p.gameId) }), stringify: (p) => ({ gameId: String(p.gameId) }) },
  // The router already parses `?perfil=7` into a number.
  validateSearch: Schema.toStandardSchemaV1(Schema.Struct({ perfil: Schema.optionalKey(ProfileId) })),
  beforeLoad: ({ context, location }) => {
    if (context.visitor === null) throw redirect({ to: '/entrar', search: returnHere(location) })
  },
  loaderDeps: ({ search }) => ({ perfil: search.perfil ?? null }),
  loader: ({ params, deps }) => reportOptionsFn({ data: { gameId: params.gameId, perfil: deps.perfil } }),
  head: ({ loaderData }) => ({ meta: [{ title: `Reportar ${loaderData?.game.title ?? 'resultado'} · OpenGame Linux` }] }),
  component: ReportPage,
})

type Options = Awaited<ReturnType<typeof reportOptionsFn>>
type Submitted = { readonly id: ReportId; readonly hasFailures: boolean; readonly proton: boolean }

function ReportPage() {
  const options = Route.useLoaderData()
  const [submitted, setSubmitted] = useState<Submitted | null>(null)
  const { game } = options

  return (
    <main className="wrapper">
      <p className="caption">Reportar resultado</p>
      <h1>{game.title}</h1>
      {submitted !== null ? (
        <section className="card stack" aria-live="polite">
          <h2>Reporte enviado</h2>
          <p>
            Queda <strong>pendiente de revisión</strong> y no cuenta en el resumen del juego hasta que un revisor lo apruebe.
          </p>
          <p className="row">
            <Link to="/juegos/$gameId" params={{ gameId: game.id }}>
              Volver a la ficha del juego
            </Link>
            {submitted.hasFailures && (
              <Link to="/reportes/$reportId/solucion" params={{ reportId: submitted.id }}>
                ¿Conoces una solución? Propónla
              </Link>
            )}
            {submitted.proton && (
              <Link to="/reportes/$reportId/proton" params={{ reportId: submitted.id }}>
                Prepara el informe para Valve
              </Link>
            )}
            <button type="button" className="button-secondary" onClick={() => setSubmitted(null)}>
              Reportar otro resultado
            </button>
          </p>
        </section>
      ) : options.diagnostics.length === 0 ? (
        <section className="card note stack">
          <p>Para reportar necesitas un diagnóstico de tu equipo hecho en Linux: el reporte guarda el entorno exacto de la prueba.</p>
          <p>
            <Link to="/diagnostico">Hacer un diagnóstico</Link>
          </p>
        </section>
      ) : (
        <ReportForm options={options} onSubmitted={setSubmitted} />
      )}
    </main>
  )
}

const byId = <I extends number>(list: ReadonlyArray<{ readonly id: I }>, value: string) => list.find((x) => String(x.id) === value)?.id

const mismatchNames = (o: Options) => {
  const distributions = new Map<number, string>([
    ...o.profiles.map((p) => [p.distribution_id, p.distribution] as const),
    ...o.diagnostics.map((d) => [d.distribution_id, d.distribution] as const),
  ])
  const layerName = (id: number) => {
    const c = o.layers.find((x) => x.id === id)
    return c === undefined ? 'otra capa' : `${c.family} ${c.variant} ${c.version}`
  }
  return (d: Encoded<IncomparableProfile>['mismatches'][number]): readonly [string, string] => {
    switch (d.aspect) {
      case 'edicion':
        return [o.editions.find((e) => e.id === d.expected)?.launcher ?? 'otra edición', o.editions.find((e) => e.id === d.actual)?.launcher ?? 'otra edición']
      case 'capa':
        return [layerName(d.expected), layerName(d.actual)]
      case 'distribucion':
        return [distributions.get(d.expected) ?? 'otra distribución', distributions.get(d.actual) ?? 'otra distribución']
      case 'arquitectura':
      case 'version_juego':
        return [d.expected, d.actual]
    }
  }
}

function ReportForm({ options, onSubmitted }: { options: Options; onSubmitted: (submitted: Submitted) => void }) {
  const { diagnostics, editions, layers, profiles, failureTypes, selectedProfile } = options
  const selected = profiles.find((p) => p.id === selectedProfile)

  const [diagnosticId, setDiagnosticId] = useState(diagnostics.at(0)?.id)
  const [editionId, setEditionId] = useState(selected?.edition_id ?? editions.at(0)?.id)
  const [layerType, setLayerType] = useState<'existente' | 'nueva'>('existente')
  const [layerId, setLayerId] = useState(selected?.layer_version_id ?? layers.at(0)?.id)
  const [newLayer, setNewLayer] = useState<{ readonly family: LayerFamily; readonly variant: string }>({ family: 'Wine', variant: '' })
  const [gameVersion, setGameVersion] = useState(selected?.target_game_version ?? '')
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

  const nameOf = mismatchNames(options)
  const r = useAction(NewReport, submitReportFn, {
    onFailure: (f: Encoded<RuleViolated | IncomparableProfile>): FieldErrors => {
      switch (f._tag) {
        case 'ReglaIncumplida':
          return ruleErrors(f)
        case 'PerfilNoComparable': {
          const errors: Record<string, string> = {}
          for (const d of f.mismatches) {
            const { field: c, message } = profileMismatches[d.aspect]
            errors[c] = [errors[c], message(...nameOf(d))].filter((m) => m !== undefined).join(' ')
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

  return (
    <form className="card form form-wide" {...r.form}>
      <FieldError errors={r.errors} field="form" />

      <h2 className="section-title">Dónde probaste</h2>
      <Field errors={r.errors} name="diagnostic_id" label="Diagnóstico del equipo" help="Solo aparecen tus diagnósticos hechos en Linux.">
        <select {...fieldProps(r.errors, 'diagnostic_id')} value={diagnosticId ?? ''} onChange={(e) => setDiagnosticId(byId(diagnostics, e.currentTarget.value))}>
          {diagnostics.map((d) => (
            <option key={d.id} value={d.id}>
              {d.machine} · {d.distribution} · {d.architecture} · {dateTime(d.captured_at)}
            </option>
          ))}
        </select>
      </Field>
      <Field errors={r.errors} name="edition_id" label="Edición (lanzador)">
        <select {...fieldProps(r.errors, 'edition_id')} value={editionId ?? ''} onChange={(e) => setEditionId(byId(editions, e.currentTarget.value))}>
          {editions.map((e) => (
            <option key={e.id} value={e.id}>
              {e.launcher}
            </option>
          ))}
        </select>
      </Field>

      <fieldset className="group">
        <legend>Capa de compatibilidad usada</legend>
        <div className="row">
          <label className="checkbox">
            <input type="radio" name="layer_version[_tag]" value="existente" checked={layerType === 'existente'} onChange={() => setLayerType('existente')} />
            Una versión de la lista
          </label>
          <label className="checkbox">
            <input type="radio" name="layer_version[_tag]" value="nueva" checked={layerType === 'nueva'} onChange={() => setLayerType('nueva')} />
            Otra versión
          </label>
        </div>
        {layerType === 'existente' ? (
          <Field errors={r.errors} name="layer_version[id]" label="Versión">
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
            <Field errors={r.errors} name="layer_version[family]" label="Familia">
              <select
                {...fieldProps(r.errors, 'layer_version[family]')}
                value={newLayer.family}
                onChange={(e) => setNewLayer({ ...newLayer, family: LayerFamily.literals.find((f) => f === e.currentTarget.value) ?? newLayer.family })}
              >
                {LayerFamily.literals.map((f) => (
                  <option key={f}>{f}</option>
                ))}
              </select>
            </Field>
            <Field errors={r.errors} name="layer_version[variant]" label="Variante">
              <input
                {...fieldProps(r.errors, 'layer_version[variant]')}
                value={newLayer.variant}
                onChange={(e) => setNewLayer({ ...newLayer, variant: e.currentTarget.value })}
                placeholder="GE"
              />
            </Field>
            <Field errors={r.errors} name="layer_version[version]" label="Versión exacta">
              <input {...fieldProps(r.errors, 'layer_version[version]')} placeholder="9-20" />
            </Field>
          </div>
        )}
        <FieldError errors={r.errors} field="layer_version" />
      </fieldset>

      <div className="row inline-fields">
        <Field errors={r.errors} name="game_version" label="Versión o build del juego">
          <input {...fieldProps(r.errors, 'game_version')} value={gameVersion} onChange={(e) => setGameVersion(e.currentTarget.value)} placeholder="1.0.3179" />
        </Field>
        <Field errors={r.errors} name="launcher_version" label="Versión del lanzador (opcional)">
          <input {...fieldProps(r.errors, 'launcher_version')} />
        </Field>
      </div>

      <Field
        errors={r.errors}
        name="profile_id"
        label="Perfil que seguiste"
        help="Solo aparecen los perfiles que coinciden con tu diagnóstico, la edición, la capa y la versión del juego."
      >
        <select {...fieldProps(r.errors, 'profile_id')} value={profileValue} onChange={(e) => setProfileId(e.currentTarget.value)}>
          <option value={nullText}>Sin perfil</option>
          {comparable.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title} (r{p.revision}, {reviewStatus[p.review_status].text.toLowerCase()}) · {p.distribution}
            </option>
          ))}
        </select>
      </Field>

      <h2 className="section-title">Qué pasó</h2>
      <Field errors={r.errors} name="tested_at" label="Fecha y hora de la prueba">
        <input {...fieldProps(r.errors, 'tested_at')} type="datetime-local" />
      </Field>
      <fieldset className="group">
        <legend>Resultado</legend>
        <div className="row">
          {Outcome.literals.map((value) => (
            <label key={value} className="checkbox">
              <input type="radio" name="outcome" value={value} checked={outcome === value} onChange={() => setOutcome(value)} />
              {outcomeLabel[value].text}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="group">
        <legend>Fallos observados</legend>
        <p className="small muted">
          {requiresFailure[outcome]
            ? 'Indica al menos un tipo de fallo. Si no sabes la causa, elige «Otro» y describe el síntoma.'
            : 'Opcional: anota cualquier problema aunque el juego funcione.'}
        </p>
        {failures.map((key, i) => (
          <div key={key} className="row inline-fields">
            <Field errors={r.errors} name={`failures[${i}][failure_type_id]`} label="Tipo">
              <select {...fieldProps(r.errors, `failures[${i}][failure_type_id]`)}>
                {failureTypes.map((t) => (
                  <option key={t.id} value={t.id} title={t.description}>
                    {failureType(t.code).text}
                  </option>
                ))}
              </select>
            </Field>
            <Field errors={r.errors} name={`failures[${i}][detail]`} label="Qué viste">
              <input {...fieldProps(r.errors, `failures[${i}][detail]`)} />
            </Field>
            <button type="button" className="button-secondary" onClick={() => setFailures(failures.filter((f) => f !== key))}>
              Quitar
            </button>
          </div>
        ))}
        <p>
          <button type="button" className="button-secondary" onClick={addFailure}>
            Añadir un fallo
          </button>
        </p>
        <FieldError errors={r.errors} field="failures" />
      </fieldset>

      <OptionalGroup name="measurement" label="Medí los FPS">
        <p className="small muted">Sin medición el reporte no guarda FPS; nunca se convierte en cero.</p>
        <div className="row inline-fields">
          <Field errors={r.errors} name="measurement[avg_fps]" label="FPS promedio">
            <input {...fieldProps(r.errors, 'measurement[avg_fps]')} type="number" inputMode="decimal" min="0" step="0.01" />
          </Field>
          <Field errors={r.errors} name="measurement[resolution]" label="Resolución">
            <input {...fieldProps(r.errors, 'measurement[resolution]')} placeholder="1920x1080" />
          </Field>
          <Field errors={r.errors} name="measurement[graphics_quality]" label="Calidad gráfica">
            <input {...fieldProps(r.errors, 'measurement[graphics_quality]')} placeholder="Medio" />
          </Field>
        </div>
        <Field errors={r.errors} name="measurement[measurement_method]" label="Cómo mediste">
          <input {...fieldProps(r.errors, 'measurement[measurement_method]')} placeholder="MangoHud · escena · duración" />
        </Field>
      </OptionalGroup>

      <Field errors={r.errors} name="observations" label="Observaciones" help="Resultado, limitaciones y cualquier ajuste extra que hiciste fuera del perfil.">
        <textarea {...fieldProps(r.errors, 'observations')} rows={4} />
      </Field>

      <button type="submit" disabled={r.submitting}>
        {r.submitting ? 'Enviando…' : 'Enviar reporte'}
      </button>
    </form>
  )
}
