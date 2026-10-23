// Lives under routes/ rather than ui/ because the reviewer forms call a server fn, which ui/ may not import.
import { useRouter } from '@tanstack/react-router'
import type { ProfileId } from '../../../domain/ids.ts'
import { type FixExport, FixNote, type PrNumber, type Skipped, openGamePrs, prUrl } from '../../../domain/upstream.ts'
import { noteFixFn } from '../../../fns/upstream.ts'
import { CopyBox } from '../../../ui/compatibility/CopyBox.tsx'
import { FieldError } from '../../../ui/FieldError.tsx'
import { Field, fieldProps } from '../../../ui/form.tsx'
import { DemoStamp } from '../../../ui/DemoStamp.tsx'
import { useT } from '../../../ui/i18n/messages.ts'
import { ruleErrors, useAction } from '../../../ui/useAction.ts'

type Fix = { readonly pr: PrNumber; readonly noted_at: Date }

/**
 * The "share with umu-protonfixes" section of an approved profile: its fix file, what did not translate, and the merged PRs it
 * led to. The file and the PR text it proposes go to the project, so they stay in English in every language.
 */
export function ShareUpstream({
  profileId,
  fixExport: x,
  fixes,
  reviewer,
}: {
  profileId: ProfileId
  fixExport: FixExport
  fixes: ReadonlyArray<Fix>
  reviewer: boolean
}) {
  const t = useT()
  const u = t.profile.upstream
  return (
    <section className="block stack" aria-labelledby="upstream">
      <h2 id="upstream" className="section-title">
        {u.heading}
      </h2>
      {x._tag === 'no_exportable' && <p className="card muted">{t.notExportableReason[x.reason]}</p>}
      {x._tag === 'nada_traducible' && (
        <div className="card stack">
          <p>{x.skipped.length === 0 ? u.nothing : u.nothingTranslates}</p>
          <SkippedList skipped={x.skipped} />
        </div>
      )}
      {x._tag === 'archivo' && (
        <>
          <p>{u.file(x.path)}</p>
          <CopyBox label={u.useNow} text={x.local_command} />
          <p className="small note" data-tone="azul">
            {u.onlyGe}
          </p>
          <CopyBox label={u.fileCopy(x.path)} text={x.content} />
          {x.skipped.length > 0 && (
            <div className="stack">
              <p className="small">{u.skipped}</p>
              <SkippedList skipped={x.skipped} />
            </div>
          )}
          <p className="row">
            <a href={x.view_existing} target="_blank" rel="noreferrer">
              {u.existing}
            </a>
            {x.propose._tag === 'enlace' ? (
              <a className="button" href={x.propose.url} target="_blank" rel="noreferrer">
                {u.propose}
              </a>
            ) : (
              <span className="row small muted">
                <DemoStamp /> {u.demo}
              </span>
            )}
          </p>
          {fixes.length > 0 && (
            <ul className="card-list">
              {fixes.map((a) => (
                <li key={a.pr} className="card row">
                  <a href={prUrl(a.pr)} target="_blank" rel="noreferrer">
                    {u.accepted(a.pr)}
                  </a>
                  <span className="small muted">{u.notedOn(t.date(a.noted_at))}</span>
                  {reviewer && <RetractFix pr={a.pr} />}
                </li>
              ))}
            </ul>
          )}
          {/* Keyed by the count so a recorded PR clears the field. */}
          {reviewer && <NoteFix key={fixes.length} profileId={profileId} />}
        </>
      )}
    </section>
  )
}

function SkippedList({ skipped }: { skipped: ReadonlyArray<Skipped> }) {
  const t = useT()
  return (
    <ul className="small">
      {skipped.map((o, i) => (
        <li key={i}>
          <code>{o.text}</code>: {t.skipReason[o.reason]}.
        </li>
      ))}
    </ul>
  )
}

function NoteFix({ profileId }: { profileId: ProfileId }) {
  const router = useRouter()
  const r = useAction(FixNote, noteFixFn, { onFailure: ruleErrors, onComplete: () => router.invalidate() })
  const n = useT().profile.upstream.note
  return (
    <form className="card form" {...r.form}>
      <FieldError errors={r.errors} field="form" />
      <input type="hidden" name="_tag" value="Aceptado" />
      <input type="hidden" name="profile_id" value={profileId} />
      <Field errors={r.errors} name="pr" label={n.label}>
        <input {...fieldProps(r.errors, 'pr')} placeholder="https://github.com/Open-Wine-Components/umu-protonfixes/pull/…" />
      </Field>
      <p className="small muted">
        {n.help}{' '}
        <a href={openGamePrs} target="_blank" rel="noreferrer">
          {n.search}
        </a>
      </p>
      <button type="submit" disabled={r.submitting}>
        {r.submitting ? n.sending : n.submit}
      </button>
    </form>
  )
}

function RetractFix({ pr }: { pr: PrNumber }) {
  const router = useRouter()
  const r = useAction(FixNote, noteFixFn, { onFailure: ruleErrors, onComplete: () => router.invalidate() })
  const t = useT()
  return (
    <form className="row" {...r.form}>
      <input type="hidden" name="_tag" value="Anular" />
      <input type="hidden" name="pr" value={pr} />
      <button type="submit" className="button-secondary" disabled={r.submitting}>
        {t.profile.upstream.retract}
      </button>
      <FieldError errors={r.errors} field="form" />
    </form>
  )
}
