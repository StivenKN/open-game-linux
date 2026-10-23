// `$profileId_` keeps this page out of the profile page's layout (it renders on its own).
import { createFileRoute, Link, redirect, useNavigate } from '@tanstack/react-router'
import { Schema } from 'effect'
import { useState } from 'react'
import { ProfileEdit } from '../../../domain/contributions.ts'
import { ProfileId } from '../../../domain/ids.ts'
import { deleteProfileFn, editProfileFn, profileEditOptionsFn } from '../../../fns/contributions.ts'
import { FieldError } from '../../../ui/FieldError.tsx'
import { useLang, useT } from '../../../ui/i18n/messages.ts'
import { ruleErrors, useAction } from '../../../ui/useAction.ts'
import { titled } from '../../-head.ts'
import { routeIdParser } from '../../-ids.ts'
import { returnHere } from '../../-return-to.ts'
import { ProfileContentFields } from './-form.tsx'

const profileId = routeIdParser(ProfileId)

export const Route = createFileRoute('/$lang/perfiles/$profileId_/editar')({
  params: { parse: (p) => ({ profileId: profileId(p.profileId) }), stringify: (p) => ({ profileId: String(p.profileId) }) },
  beforeLoad: ({ context, location, params }) => {
    if (context.visitor === null) throw redirect({ to: '/$lang/entrar', params: { lang: params.lang }, search: returnHere(location) })
  },
  loader: ({ params }) => profileEditOptionsFn({ data: params }),
  head: ({ params }) => titled(params.lang, (t) => t.profile.edit.title),
  component: EditProfilePage,
})

type Profile = Awaited<ReturnType<typeof profileEditOptionsFn>>['profile']

function EditProfilePage() {
  const { profile: p, draft, dependencies } = Route.useLoaderData()
  const navigate = useNavigate()
  const t = useT()
  const lang = useLang()
  const e = t.profile.edit
  const r = useAction(ProfileEdit, editProfileFn, {
    onFailure: ruleErrors,
    onComplete: ({ id }) => void navigate({ to: '/$lang/perfiles/$profileId', params: { lang, profileId: id } }),
  })

  return (
    <main className="wrapper">
      <div className="breadcrumbs">
        <Link to="/$lang/juegos/$gameId" params={{ lang, gameId: p.game_id }}>{p.game}</Link> /{' '}
        <Link to="/$lang/perfiles/$profileId" params={{ lang, profileId: p.id }}>{t.profile.breadcrumb}</Link> / {e.breadcrumb}
      </div>
      <h1>{t.profile.editProposal}</h1>
      <div className="chip-row">
        <span className="chip">{p.launcher}</span>
        <span className="chip">{p.distribution}</span>
        <span className="chip">{p.layer}</span>
        <span className="chip">{p.architecture}</span>
        <span className="chip">r{p.revision}</span>
      </div>
      {p.editable ? (
        <>
          <p className="muted">{e.setupStays}</p>
          <form className="card form form-wide" {...r.form}>
            <FieldError errors={r.errors} field="form" />
            <input type="hidden" name="profile_id" value={p.id} />
            <ProfileContentFields errors={r.errors} dependencies={dependencies} draft={draft} />
            <p className="row">
              <button type="submit" disabled={r.submitting}>
                {r.submitting ? e.saving : e.save}
              </button>
              <Link to="/$lang/perfiles/$profileId" params={{ lang, profileId: p.id }}>
                {e.cancel}
              </Link>
            </p>
          </form>
          <DeleteProposal profile={p} />
        </>
      ) : (
        <section className="card note stack" data-tone="amarillo">
          <p>{e.frozen}</p>
          <p>
            <Link to="/$lang/juegos/$gameId/perfiles/nuevo" params={{ lang, gameId: p.game_id }} search={{ desde: p.id }}>
              {t.profile.newVersion}
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
  const lang = useLang()
  const d = useT().profile.edit.delete
  const [confirming, setConfirming] = useState(false)
  const r = useAction(DeleteForm, deleteProfileFn, {
    onFailure: ruleErrors,
    onComplete: ({ game_id }) => void navigate({ to: '/$lang/juegos/$gameId', params: { lang, gameId: game_id } }),
  })
  return (
    <section className="card stack form-wide" aria-labelledby="delete-proposal">
      <h2 id="delete-proposal">{d.heading}</h2>
      <p className="small muted">{d.note}</p>
      <form className="row" {...r.form}>
        <input type="hidden" name="profile_id" value={p.id} />
        {confirming ? (
          <>
            <button type="submit" disabled={r.submitting}>
              {d.confirm}
            </button>
            <button type="button" className="button-secondary" onClick={() => setConfirming(false)}>
              {d.keep}
            </button>
          </>
        ) : (
          <button type="button" className="button-secondary" onClick={() => setConfirming(true)}>
            {d.heading}
          </button>
        )}
      </form>
      <FieldError errors={r.errors} field="form" />
    </section>
  )
}
