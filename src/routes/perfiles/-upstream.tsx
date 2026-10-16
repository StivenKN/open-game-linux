// Lives under routes/ rather than ui/ because the reviewer forms call a server fn, which ui/ may not import.
import { useRouter } from '@tanstack/react-router'
import type { ProfileId } from '../../domain/ids.ts'
import { type FixExport, FixNote, type PrNumber, type Skipped, openGamePrs, prUrl } from '../../domain/upstream.ts'
import { noteFixFn } from '../../fns/upstream.ts'
import { CopyBox } from '../../ui/compatibility/CopyBox.tsx'
import { FieldError } from '../../ui/FieldError.tsx'
import { date } from '../../ui/format.ts'
import { Field, fieldProps } from '../../ui/form.tsx'
import { DemoStamp } from '../../ui/DemoStamp.tsx'
import { ruleErrors, useAction } from '../../ui/useAction.ts'
import { notExportableReason, skipReason } from '../../ui/vocabulary.ts'

type Fix = { readonly pr: PrNumber; readonly registrado_en: Date }

/** "Compartir con umu-protonfixes" on an approved profile: its fix file, what did not translate, and the merged PRs it led to. */
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
  return (
    <section className="bloque pila" aria-labelledby="upstream">
      <h2 id="upstream" className="titulo-seccion">
        Compartir con umu-protonfixes
      </h2>
      {x._tag === 'no_exportable' && <p className="tarjeta tenue">{notExportableReason[x.reason]}</p>}
      {x._tag === 'nada_traducible' && (
        <div className="tarjeta pila">
          <p>
            {x.skipped.length === 0
              ? 'Este perfil no tiene opciones de lanzamiento ni dependencias que se conviertan en un arreglo de umu-protonfixes.'
              : 'Nada de este perfil se convierte en un arreglo de umu-protonfixes:'}
          </p>
          <SkippedList skipped={x.skipped} />
        </div>
      )}
      {x._tag === 'archivo' && (
        <>
          <p>
            umu-protonfixes aplica arreglos por juego cuando lo abres con GE-Proton o umu. Este perfil se traduce en el archivo{' '}
            <code>{x.path}</code>; puedes usarlo hoy mismo y proponerlo al proyecto para que llegue a todos.
          </p>
          <CopyBox label="Úsalo ya en tu PC" text={x.local_command} />
          <p className="pequeno nota" data-tono="azul">
            Solo GE-Proton y umu leen esta carpeta; el Proton de Valve no.
          </p>
          <CopyBox label={`Archivo ${x.path}`} text={x.content} />
          {x.skipped.length > 0 && (
            <div className="pila">
              <p className="pequeno">No pasó al archivo:</p>
              <SkippedList skipped={x.skipped} />
            </div>
          )}
          <p className="fila">
            <a href={x.view_existing} target="_blank" rel="noreferrer">
              ¿Ya existe un arreglo? Revísalo primero
            </a>
            {x.propose._tag === 'enlace' ? (
              <a className="boton" href={x.propose.url} target="_blank" rel="noreferrer">
                Proponerlo en GitHub
              </a>
            ) : (
              <span className="fila pequeno tenue">
                <DemoStamp /> Los datos de ejemplo no se envían a umu-protonfixes.
              </span>
            )}
          </p>
          {fixes.length > 0 && (
            <ul className="lista-tarjetas">
              {fixes.map((a) => (
                <li key={a.pr} className="tarjeta fila">
                  <a href={prUrl(a.pr)} target="_blank" rel="noreferrer">
                    Aceptado en umu-protonfixes · PR #{a.pr}
                  </a>
                  <span className="pequeno tenue">registrado el {date(a.registrado_en)}</span>
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
  return (
    <ul className="pequeno">
      {skipped.map((o, i) => (
        <li key={i}>
          <code>{o.text}</code>: {skipReason[o.reason]}.
        </li>
      ))}
    </ul>
  )
}

function NoteFix({ profileId }: { profileId: ProfileId }) {
  const router = useRouter()
  const r = useAction(FixNote, noteFixFn, { onFailure: ruleErrors, onComplete: () => router.invalidate() })
  return (
    <form className="tarjeta formulario" {...r.form}>
      <FieldError errors={r.errors} field="formulario" />
      <input type="hidden" name="_tag" value="Aceptado" />
      <input type="hidden" name="perfil_id" value={profileId} />
      <Field errors={r.errors} name="pr" label="Registrar un PR fusionado (revisores)">
        <input {...fieldProps(r.errors, 'pr')} placeholder="https://github.com/Open-Wine-Components/umu-protonfixes/pull/…" />
      </Field>
      <p className="pequeno tenue">
        Solo PR ya fusionados: cada uno suma al contador público.{' '}
        <a href={openGamePrs} target="_blank" rel="noreferrer">
          Buscar PR fusionados de OpenGame
        </a>
      </p>
      <button type="submit" disabled={r.submitting}>
        {r.submitting ? 'Registrando…' : 'Registrar PR aceptado'}
      </button>
    </form>
  )
}

function RetractFix({ pr }: { pr: PrNumber }) {
  const router = useRouter()
  const r = useAction(FixNote, noteFixFn, { onFailure: ruleErrors, onComplete: () => router.invalidate() })
  return (
    <form className="fila" {...r.form}>
      <input type="hidden" name="_tag" value="Anular" />
      <input type="hidden" name="pr" value={pr} />
      <button type="submit" className="boton-secundario" disabled={r.submitting}>
        Anular
      </button>
      <FieldError errors={r.errors} field="formulario" />
    </form>
  )
}
