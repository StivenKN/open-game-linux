import { createFileRoute, notFound, redirect, useNavigate } from '@tanstack/react-router'
import { Schema } from 'effect'
import { useRef, useState } from 'react'
import { NewGame, SteamLookup } from '../../../domain/contributions.ts'
import { GameRequestId } from '../../../domain/ids.ts'
import { STEAM_LAUNCHER } from '../../../domain/library.ts'
import { GraphicsApi } from '../../../domain/literals.ts'
import type { X86Level } from '../../../domain/platform.ts'
import { createGameFn, gameOptionsFn, steamGameFn } from '../../../fns/contributions.ts'
import { FieldError } from '../../../ui/FieldError.tsx'
import { Field, fieldProps, nullText } from '../../../ui/form.tsx'
import { ruleErrors, useAction } from '../../../ui/useAction.ts'
import { graphicsApi, steamUnavailable, x86Level } from '../../../ui/vocabulary.ts'
import { returnHere } from '../../-return-to.ts'

// v1 is every x86-64 CPU, so it is no requirement.
const minimumLevels = ['v2', 'v3', 'v4'] as const satisfies ReadonlyArray<X86Level>

export const Route = createFileRoute('/$lang/catalogo/nuevo')({
  // `?pedido=` starts the form from an open game request (the "Crear el juego" link on /pedidos).
  validateSearch: Schema.toStandardSchemaV1(Schema.Struct({ pedido: Schema.optionalKey(GameRequestId) })),
  beforeLoad: ({ context, location }) => {
    if (context.visitor === null) throw redirect({ to: '/entrar', search: returnHere(location) })
    if (context.visitor.role === 'usuario') throw notFound()
  },
  loaderDeps: ({ search }) => ({ pedido: search.pedido ?? null }),
  // The form's state starts from the request, so another request, or none, starts a fresh form.
  remountDeps: ({ loaderDeps }) => loaderDeps,
  loader: ({ deps }) => gameOptionsFn({ data: deps }),
  head: () => ({ meta: [{ title: 'Nuevo juego · OpenGame Linux' }] }),
  component: NewGamePage,
})

// Select and input values, so a row reads back exactly what the form posts.
type EditionRow = { readonly key: number; readonly launcher_id: string; readonly external_id: string }

function NewGamePage() {
  const { launchers, request } = Route.useLoaderData()
  const { pedido } = Route.useLoaderDeps()
  const navigate = useNavigate()
  const steam = launchers.find((l) => l.name === STEAM_LAUNCHER)
  const appid = request?.steam_app_id ?? null
  const [title, setTitle] = useState(request?.title ?? '')
  const [description, setDescription] = useState('')
  // Row keys, not indexes: removing a middle edition must not shift what the other rows show.
  const [editions, setEditions] = useState<ReadonlyArray<EditionRow>>([
    { key: 0, launcher_id: String((steam ?? launchers[0])?.id ?? ''), external_id: appid === null ? '' : String(appid) },
  ])
  const nextKey = useRef(1)
  const newKey = () => nextKey.current++
  const [filledFrom, setFilledFrom] = useState<string | null>(null)

  const r = useAction(NewGame, createGameFn, {
    onFailure: ruleErrors,
    onComplete: ({ id }) => void navigate({ to: '/juegos/$gameId', params: { gameId: id } }),
  })

  // Steam fills the title, the description and the Steam edition's App ID; every other field stays as it is.
  const lookup = useAction(SteamLookup, steamGameFn, {
    onFailure: (f) => {
      setFilledFrom(null)
      return { steam_app_id: steamUnavailable[f.reason] }
    },
    onComplete: (game) => {
      setTitle(game.title)
      setDescription(game.description)
      setFilledFrom(game.title)
      if (steam === undefined) return
      const steamRow = { launcher_id: String(steam.id), external_id: String(game.appid) }
      // Updaters, not this render's rows: the reviewer may have edited the editions while Steam answered.
      setEditions((current) =>
        current.some((e) => e.launcher_id === steamRow.launcher_id)
          ? current.map((e) => (e.launcher_id === steamRow.launcher_id ? { ...e, ...steamRow } : e))
          : [{ key: newKey(), ...steamRow }, ...current],
      )
    },
  })

  const setEdition = (key: number, change: Partial<Omit<EditionRow, 'key'>>) =>
    setEditions((current) => current.map((e) => (e.key === key ? { ...e, ...change } : e)))
  const addEdition = () => {
    const unused = launchers.find((l) => !editions.some((e) => e.launcher_id === String(l.id)))
    setEditions([...editions, { key: newKey(), launcher_id: String((unused ?? launchers[0])?.id ?? ''), external_id: '' }])
  }

  return (
    <main className="wrapper">
      <p className="caption">Catálogo</p>
      <h1>Nuevo juego</h1>
      {request !== null && (
        <p className="note small">
          Creas el juego que se pidió como «{request.title}». Al crearlo, el pedido queda cumplido y enlaza a su ficha.
        </p>
      )}
      {pedido !== null && request === null && (
        <p className="note small" data-tone="amarillo">
          Ese pedido ya no está abierto, así que el juego que crees no quedará enlazado a él.
        </p>
      )}

      <form className="card form form-wide" aria-labelledby="steam-title" {...lookup.form}>
        <h2 id="steam-title" className="no-margin">
          Rellenar desde Steam
        </h2>
        <p className="small muted no-margin">
          Trae el título, la descripción y la edición de Steam desde la tienda. Todo sigue editable, y las APIs gráficas y la CPU mínima
          las marcas tú.
        </p>
        <div className="row inline-fields">
          <Field errors={lookup.errors} name="steam_app_id" label="Enlace o App ID de Steam">
            <input {...fieldProps(lookup.errors, 'steam_app_id')} defaultValue={appid ?? ''} placeholder="https://store.steampowered.com/app/…" />
          </Field>
          <button type="submit" className="button-secondary" disabled={lookup.submitting}>
            {lookup.submitting ? 'Consultando a Steam…' : 'Rellenar desde Steam'}
          </button>
        </div>
        <FieldError errors={lookup.errors} field="form" />
        {filledFrom !== null && (
          <p className="small" role="status">
            Rellenado con los datos de Steam de «{filledFrom}». Revisa cada campo antes de crear el juego.
          </p>
        )}
      </form>

      <form className="card form form-wide" {...r.form}>
        <FieldError errors={r.errors} field="form" />
        <input type="hidden" name="request_id" value={request?.id ?? nullText} />
        <Field errors={r.errors} name="title" label="Título">
          <input {...fieldProps(r.errors, 'title')} value={title} onChange={(e) => setTitle(e.currentTarget.value)} />
        </Field>
        <Field errors={r.errors} name="description" label="Descripción">
          <textarea {...fieldProps(r.errors, 'description')} value={description} onChange={(e) => setDescription(e.currentTarget.value)} />
        </Field>

        <fieldset className="group">
          <legend>Ediciones</legend>
          <p className="small muted">Una por lanzador. El identificador es el de la tienda (por ejemplo, el App ID de Steam), si lo conoces.</p>
          {editions.map((e, i) => (
            <div key={e.key} className="row inline-fields">
              <Field errors={r.errors} name={`editions[${i}][launcher_id]`} label="Lanzador">
                <select
                  {...fieldProps(r.errors, `editions[${i}][launcher_id]`)}
                  value={e.launcher_id}
                  onChange={(event) => setEdition(e.key, { launcher_id: event.currentTarget.value })}
                >
                  {launchers.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field errors={r.errors} name={`editions[${i}][external_id]`} label="Identificador (opcional)">
                <input
                  {...fieldProps(r.errors, `editions[${i}][external_id]`)}
                  value={e.external_id}
                  onChange={(event) => setEdition(e.key, { external_id: event.currentTarget.value })}
                />
              </Field>
              <button
                type="button"
                className="button-secondary"
                disabled={editions.length === 1}
                onClick={() => setEditions(editions.filter((other) => other.key !== e.key))}
              >
                Quitar
              </button>
            </div>
          ))}
          <p>
            <button type="button" className="button-secondary" onClick={addEdition} disabled={editions.length >= launchers.length}>
              Añadir una edición
            </button>
          </p>
          <FieldError errors={r.errors} field="editions" />
        </fieldset>

        <fieldset className="group">
          <legend>APIs gráficas</legend>
          <p className="small muted">Marca cada API con la que el juego puede dibujar, aunque sea un modo alternativo.</p>
          <div className="row">
            {GraphicsApi.literals.map((api) => (
              <label key={api} className="checkbox">
                <input type="checkbox" name="apis[]" value={api} />
                {graphicsApi[api]}
              </label>
            ))}
          </div>
          <FieldError errors={r.errors} field="apis" />
        </fieldset>

        <Field errors={r.errors} name="x86_level_min" label="CPU mínima" help="Solo si el juego exige un conjunto de instrucciones, como SSE4.2 en Counter-Strike 2.">
          <select {...fieldProps(r.errors, 'x86_level_min')} defaultValue={nullText}>
            <option value={nullText}>Sin requisito</option>
            {minimumLevels.map((n) => (
              <option key={n} value={n}>
                {x86Level[n]}
              </option>
            ))}
          </select>
        </Field>

        <button type="submit" disabled={r.submitting}>
          Crear juego
        </button>
      </form>
    </main>
  )
}
