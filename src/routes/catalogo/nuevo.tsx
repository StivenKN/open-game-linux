import { createFileRoute, notFound, redirect, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { NewGame } from '../../domain/contributions.ts'
import { GraphicsApi } from '../../domain/literals.ts'
import type { X86Level } from '../../domain/platform.ts'
import { createGameFn, gameOptionsFn } from '../../fns/contributions.ts'
import { FieldError } from '../../ui/FieldError.tsx'
import { Field, fieldProps, nullText } from '../../ui/form.tsx'
import { ruleErrors, useAction } from '../../ui/useAction.ts'
import { graphicsApi, x86Level } from '../../ui/vocabulary.ts'
import { returnHere } from '../-return-to.ts'

// v1 is every x86-64 CPU, so it is no requirement.
const minimumLevels = ['v2', 'v3', 'v4'] as const satisfies ReadonlyArray<X86Level>

export const Route = createFileRoute('/catalogo/nuevo')({
  beforeLoad: ({ context, location }) => {
    if (context.visitor === null) throw redirect({ to: '/entrar', search: returnHere(location) })
    if (context.visitor.role === 'usuario') throw notFound()
  },
  loader: () => gameOptionsFn(),
  head: () => ({ meta: [{ title: 'Nuevo juego · OpenGame Linux' }] }),
  component: NewGamePage,
})

function NewGamePage() {
  const { launchers } = Route.useLoaderData()
  const navigate = useNavigate()
  // Row keys, not indexes: removing a middle edition must not shift what the other rows show.
  const [editions, setEditions] = useState<ReadonlyArray<number>>([0])
  const [nextKey, setNextKey] = useState(1)
  const r = useAction(NewGame, createGameFn, {
    onFailure: ruleErrors,
    onComplete: ({ id }) => void navigate({ to: '/juegos/$gameId', params: { gameId: id } }),
  })

  const addEdition = () => {
    setEditions([...editions, nextKey])
    setNextKey(nextKey + 1)
  }

  return (
    <main className="wrapper">
      <p className="caption">Catálogo</p>
      <h1>Nuevo juego</h1>
      <form className="card form form-wide" {...r.form}>
        <FieldError errors={r.errors} field="form" />
        <Field errors={r.errors} name="title" label="Título">
          <input {...fieldProps(r.errors, 'title')} />
        </Field>
        <Field errors={r.errors} name="description" label="Descripción">
          <textarea {...fieldProps(r.errors, 'description')} />
        </Field>

        <fieldset className="group">
          <legend>Ediciones</legend>
          <p className="small muted">Una por lanzador. El identificador es el de la tienda (por ejemplo, el App ID de Steam), si lo conoces.</p>
          {editions.map((key, i) => (
            <div key={key} className="row inline-fields">
              <Field errors={r.errors} name={`editions[${i}][launcher_id]`} label="Lanzador">
                <select {...fieldProps(r.errors, `editions[${i}][launcher_id]`)} defaultValue={launchers[i % launchers.length]?.id}>
                  {launchers.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field errors={r.errors} name={`editions[${i}][external_id]`} label="Identificador (opcional)">
                <input {...fieldProps(r.errors, `editions[${i}][external_id]`)} />
              </Field>
              <button
                type="button"
                className="button-secondary"
                disabled={editions.length === 1}
                onClick={() => setEditions(editions.filter((e) => e !== key))}
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
