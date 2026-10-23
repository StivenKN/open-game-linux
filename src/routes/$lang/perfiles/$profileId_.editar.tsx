// `$profileId_` keeps this page out of the profile page's layout (it renders on its own).
import { createFileRoute, Link, redirect, useNavigate } from '@tanstack/react-router'
import { Schema } from 'effect'
import { useState } from 'react'
import { ProfileEdit } from '../../../domain/contributions.ts'
import { ProfileId } from '../../../domain/ids.ts'
import { deleteProfileFn, editProfileFn, profileEditOptionsFn } from '../../../fns/contributions.ts'
import { FieldError } from '../../../ui/FieldError.tsx'
import { ruleErrors, useAction } from '../../../ui/useAction.ts'
import { routeIdParser } from '../../-ids.ts'
import { returnHere } from '../../-return-to.ts'
import { ProfileContentFields } from './-form.tsx'

const profileId = routeIdParser(ProfileId)

export const Route = createFileRoute('/$lang/perfiles/$profileId_/editar')({
  params: { parse: (p) => ({ profileId: profileId(p.profileId) }), stringify: (p) => ({ profileId: String(p.profileId) }) },
  beforeLoad: ({ context, location }) => {
    if (context.visitor === null) throw redirect({ to: '/entrar', search: returnHere(location) })
  },
  loader: ({ params }) => profileEditOptionsFn({ data: params }),
  head: () => ({ meta: [{ title: 'Editar el perfil · OpenGame Linux' }] }),
  component: EditProfilePage,
})

type Profile = Awaited<ReturnType<typeof profileEditOptionsFn>>['profile']

function EditProfilePage() {
  const { profile: p, draft, dependencies } = Route.useLoaderData()
  const navigate = useNavigate()
  const r = useAction(ProfileEdit, editProfileFn, {
    onFailure: ruleErrors,
    onComplete: ({ id }) => void navigate({ to: '/perfiles/$profileId', params: { profileId: id } }),
  })

  return (
    <main className="wrapper">
      <div className="breadcrumbs">
        <Link to="/juegos/$gameId" params={{ gameId: p.game_id }}>{p.game}</Link> /{' '}
        <Link to="/perfiles/$profileId" params={{ profileId: p.id }}>Perfil</Link> / Editar
      </div>
      <h1>Editar la propuesta</h1>
      <div className="chip-row">
        <span className="chip">{p.launcher}</span>
        <span className="chip">{p.distribution}</span>
        <span className="chip">{p.layer}</span>
        <span className="chip">{p.architecture}</span>
        <span className="chip">r{p.revision}</span>
      </div>
      {p.editable ? (
        <>
          <p className="muted">
            El entorno queda como lo propusiste. Si te equivocaste de entorno, elimina la propuesta y propón otra.
          </p>
          <form className="card form form-wide" {...r.form}>
            <FieldError errors={r.errors} field="form" />
            <input type="hidden" name="profile_id" value={p.id} />
            <ProfileContentFields errors={r.errors} dependencies={dependencies} draft={draft} />
            <p className="row">
              <button type="submit" disabled={r.submitting}>
                {r.submitting ? 'Guardando…' : 'Guardar los cambios'}
              </button>
              <Link to="/perfiles/$profileId" params={{ profileId: p.id }}>
                Cancelar
              </Link>
            </p>
          </form>
          <DeleteProposal profile={p} />
        </>
      ) : (
        <section className="card note stack" data-tone="amarillo">
          <p>Alguien ya usó este perfil en un reporte o una solución, o un revisor ya lo revisó, así que no cambia.</p>
          <p>
            <Link to="/juegos/$gameId/perfiles/nuevo" params={{ gameId: p.game_id }} search={{ desde: p.id }}>
              Proponer una versión con cambios
            </Link>
          </p>
        </section>
      )}
    </main>
  )
}

const DeleteForm = Schema.Struct({ profile_id: ProfileId })

function DeleteProposal({ profile: p }: { profile: Profile }) {
  const navigate = useNavigate()
  const [confirming, setConfirming] = useState(false)
  const r = useAction(DeleteForm, deleteProfileFn, {
    onFailure: ruleErrors,
    onComplete: ({ game_id }) => void navigate({ to: '/juegos/$gameId', params: { gameId: game_id } }),
  })
  return (
    <section className="card stack form-wide" aria-labelledby="delete-proposal">
      <h2 id="delete-proposal">Eliminar la propuesta</h2>
      <p className="small muted">Se borra con sus pasos y dependencias. No se puede deshacer.</p>
      <form className="row" {...r.form}>
        <input type="hidden" name="profile_id" value={p.id} />
        {confirming ? (
          <>
            <button type="submit" disabled={r.submitting}>
              Sí, eliminarla
            </button>
            <button type="button" className="button-secondary" onClick={() => setConfirming(false)}>
              No
            </button>
          </>
        ) : (
          <button type="button" className="button-secondary" onClick={() => setConfirming(true)}>
            Eliminar la propuesta
          </button>
        )}
      </form>
      <FieldError errors={r.errors} field="form" />
    </section>
  )
}
