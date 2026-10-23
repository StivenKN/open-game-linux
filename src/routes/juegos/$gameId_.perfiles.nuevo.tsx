// `$gameId_` keeps this page out of the game page's layout (it renders on its own).
import { createFileRoute, Link, redirect, useNavigate } from '@tanstack/react-router'
import { Schema } from 'effect'
import { useState } from 'react'
import { NewProfile } from '../../domain/contributions.ts'
import { GameId, ProfileId } from '../../domain/ids.ts'
import { LayerFamily } from '../../domain/literals.ts'
import { profileOptionsFn, proposeProfileFn } from '../../fns/contributions.ts'
import { FieldError } from '../../ui/FieldError.tsx'
import { Field, fieldProps } from '../../ui/form.tsx'
import { ruleErrors, useAction } from '../../ui/useAction.ts'
import { routeIdParser } from '../-ids.ts'
import { returnHere } from '../-return-to.ts'
import { ProfileContentFields } from '../perfiles/-form.tsx'

const gameId = routeIdParser(GameId)

export const Route = createFileRoute('/juegos/$gameId_/perfiles/nuevo')({
  params: { parse: (p) => ({ gameId: gameId(p.gameId) }), stringify: (p) => ({ gameId: String(p.gameId) }) },
  // `?desde=7` starts from profile 7: a new version of it with changes.
  validateSearch: Schema.toStandardSchemaV1(Schema.Struct({ desde: Schema.optionalKey(ProfileId) })),
  beforeLoad: ({ context, location }) => {
    if (context.visitor === null) throw redirect({ to: '/entrar', search: returnHere(location) })
  },
  loaderDeps: ({ search }) => ({ desde: search.desde ?? null }),
  loader: ({ params, deps }) => profileOptionsFn({ data: { gameId: params.gameId, desde: deps.desde } }),
  head: ({ loaderData }) => ({ meta: [{ title: `Proponer un perfil para ${loaderData?.game.title ?? 'un juego'} · OpenGame Linux` }] }),
  component: ProposeProfilePage,
})

function ProposeProfilePage() {
  const { game, editions, layers, distributions, dependencies, draft } = Route.useLoaderData()
  const navigate = useNavigate()
  const [layerType, setLayerType] = useState<'existente' | 'nueva'>('existente')
  const r = useAction(NewProfile, proposeProfileFn, {
    onFailure: ruleErrors,
    onComplete: ({ id }) => void navigate({ to: '/perfiles/$profileId', params: { profileId: id } }),
  })

  return (
    <main className="wrapper">
      <p className="caption">Proponer un perfil</p>
      <h1>{game.title}</h1>
      <p className="muted">
        Un perfil son los pasos para que el juego funcione en un entorno concreto. Queda pendiente hasta que un revisor lo apruebe con un reporte
        funcional que lo use. Mientras nadie lo use, puedes editarlo o eliminarlo.
      </p>
      {draft !== null && (
        <p className="note small" data-tone="azul">
          Empiezas con los datos de «{draft.title}». Lo que envíes es un perfil nuevo; el original no cambia.
        </p>
      )}
      <form className="card form form-wide" {...r.form}>
        <FieldError errors={r.errors} field="form" />

        <h2 className="section-title">Para qué entorno</h2>
        <p className="small muted">Un reporte solo puede usar el perfil si coincide con su edición, su distribución, su arquitectura y su capa.</p>
        <div className="fields-2">
          <Field errors={r.errors} name="edition_id" label="Edición (lanzador)">
            <select {...fieldProps(r.errors, 'edition_id')} defaultValue={draft?.edition_id}>
              {editions.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.launcher}
                </option>
              ))}
            </select>
          </Field>
          <Field errors={r.errors} name="distribution_id" label="Distribución">
            <select {...fieldProps(r.errors, 'distribution_id')} defaultValue={draft?.distribution_id}>
              {distributions.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field errors={r.errors} name="architecture" label="Arquitectura" help="La que muestra uname -m: x86_64 en casi todos los PC.">
          <input {...fieldProps(r.errors, 'architecture')} defaultValue={draft?.architecture ?? 'x86_64'} />
        </Field>

        <fieldset className="group">
          <legend>Capa de compatibilidad</legend>
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
              <Field errors={r.errors} name="layer_version[family]" label="Familia">
                <select {...fieldProps(r.errors, 'layer_version[family]')}>
                  {LayerFamily.literals.map((f) => (
                    <option key={f}>{f}</option>
                  ))}
                </select>
              </Field>
              <Field errors={r.errors} name="layer_version[variant]" label="Variante">
                <input {...fieldProps(r.errors, 'layer_version[variant]')} placeholder="GE" />
              </Field>
              <Field errors={r.errors} name="layer_version[version]" label="Versión exacta">
                <input {...fieldProps(r.errors, 'layer_version[version]')} placeholder="9-20" />
              </Field>
            </div>
          )}
          <FieldError errors={r.errors} field="layer_version" />
        </fieldset>

        <ProfileContentFields errors={r.errors} dependencies={dependencies} draft={draft} />

        <p className="row">
          <button type="submit" disabled={r.submitting}>
            {r.submitting ? 'Enviando…' : 'Proponer el perfil'}
          </button>
          <Link to="/juegos/$gameId" params={{ gameId: game.id }}>
            Volver a la ficha
          </Link>
        </p>
      </form>
    </main>
  )
}
