// `$gameId_` keeps this page out of the game page's layout (it renders on its own).
import { createFileRoute, Link, redirect, useNavigate } from '@tanstack/react-router'
import { Schema } from 'effect'
import { useState } from 'react'
import { NewProfile } from '../../../domain/contributions.ts'
import { GameId, ProfileId } from '../../../domain/ids.ts'
import { LayerFamily } from '../../../domain/literals.ts'
import { profileOptionsFn, proposeProfileFn } from '../../../fns/contributions.ts'
import { FieldError } from '../../../ui/FieldError.tsx'
import { Field, fieldProps } from '../../../ui/form.tsx'
import { useLang, useT } from '../../../ui/i18n/messages.ts'
import { ruleErrors, useAction } from '../../../ui/useAction.ts'
import { titled } from '../../-head.ts'
import { routeIdParser } from '../../-ids.ts'
import { returnHere } from '../../-return-to.ts'
import { ProfileContentFields } from '../perfiles/-form.tsx'

const gameId = routeIdParser(GameId)

export const Route = createFileRoute('/$lang/juegos/$gameId_/perfiles/nuevo')({
  params: { parse: (p) => ({ gameId: gameId(p.gameId) }), stringify: (p) => ({ gameId: String(p.gameId) }) },
  // `?desde=7` starts from profile 7: a new version of it with changes.
  validateSearch: Schema.toStandardSchemaV1(Schema.Struct({ desde: Schema.optionalKey(ProfileId) })),
  beforeLoad: ({ context, location, params }) => {
    if (context.visitor === null) throw redirect({ to: '/$lang/entrar', params: { lang: params.lang }, search: returnHere(location) })
  },
  loaderDeps: ({ search }) => ({ desde: search.desde ?? null }),
  loader: ({ params, deps }) => profileOptionsFn({ data: { gameId: params.gameId, desde: deps.desde } }),
  head: ({ loaderData, params }) => titled(params.lang, (t) => t.profile.propose.title(loaderData?.game.title ?? null)),
  component: ProposeProfilePage,
})

function ProposeProfilePage() {
  const { game, editions, layers, distributions, dependencies, draft } = Route.useLoaderData()
  const navigate = useNavigate()
  const t = useT()
  const lang = useLang()
  const p = t.profile.propose
  const [layerType, setLayerType] = useState<'existente' | 'nueva'>('existente')
  const r = useAction(NewProfile, proposeProfileFn, {
    onFailure: ruleErrors,
    onComplete: ({ id }) => void navigate({ to: '/$lang/perfiles/$profileId', params: { lang, profileId: id } }),
  })

  return (
    <main className="wrapper">
      <p className="caption">{p.caption}</p>
      <h1>{game.title}</h1>
      <p className="muted">{p.intro}</p>
      {draft !== null && (
        <p className="note small" data-tone="azul">
          {p.startingFrom(draft.title)}
        </p>
      )}
      <form className="card form form-wide" {...r.form}>
        <FieldError errors={r.errors} field="form" />

        <h2 className="section-title">{p.setup}</h2>
        <p className="small muted">{p.setupHelp}</p>
        <div className="fields-2">
          <Field errors={r.errors} name="edition_id" label={p.edition}>
            <select {...fieldProps(r.errors, 'edition_id')} defaultValue={draft?.edition_id}>
              {editions.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.launcher}
                </option>
              ))}
            </select>
          </Field>
          <Field errors={r.errors} name="distribution_id" label={p.distribution}>
            <select {...fieldProps(r.errors, 'distribution_id')} defaultValue={draft?.distribution_id}>
              {distributions.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field errors={r.errors} name="architecture" label={p.architecture.label} help={p.architecture.help}>
          <input {...fieldProps(r.errors, 'architecture')} defaultValue={draft?.architecture ?? 'x86_64'} />
        </Field>

        <fieldset className="group">
          <legend>{p.layer.legend}</legend>
          <div className="row">
            <label className="checkbox">
              <input type="radio" name="layer_version[_tag]" value="existente" checked={layerType === 'existente'} onChange={() => setLayerType('existente')} />
              {p.layer.listed}
            </label>
            <label className="checkbox">
              <input type="radio" name="layer_version[_tag]" value="nueva" checked={layerType === 'nueva'} onChange={() => setLayerType('nueva')} />
              {p.layer.other}
            </label>
          </div>
          {layerType === 'existente' ? (
            <Field errors={r.errors} name="layer_version[id]" label={p.layer.version}>
              <select {...fieldProps(r.errors, 'layer_version[id]')} defaultValue={draft?.layer_version_id}>
                {layers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.family} {c.variant} {c.version}
                  </option>
                ))}
              </select>
            </Field>
          ) : (
            <div className="row inline-fields">
              <Field errors={r.errors} name="layer_version[family]" label={p.layer.family}>
                <select {...fieldProps(r.errors, 'layer_version[family]')}>
                  {LayerFamily.literals.map((f) => (
                    <option key={f}>{f}</option>
                  ))}
                </select>
              </Field>
              <Field errors={r.errors} name="layer_version[variant]" label={p.layer.variant}>
                <input {...fieldProps(r.errors, 'layer_version[variant]')} placeholder="GE" />
              </Field>
              <Field errors={r.errors} name="layer_version[version]" label={p.layer.exactVersion}>
                <input {...fieldProps(r.errors, 'layer_version[version]')} placeholder="9-20" />
              </Field>
            </div>
          )}
          <FieldError errors={r.errors} field="layer_version" />
        </fieldset>

        <ProfileContentFields errors={r.errors} dependencies={dependencies} draft={draft} />

        <p className="row">
          <button type="submit" disabled={r.submitting}>
            {r.submitting ? p.sending : p.submit}
          </button>
          <Link to="/$lang/juegos/$gameId" params={{ lang, gameId: game.id }}>
            {p.back}
          </Link>
        </p>
      </form>
    </main>
  )
}
