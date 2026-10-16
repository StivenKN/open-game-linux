// Lives under routes/ rather than ui/ because the reviewer forms call a server fn, which ui/ may not import.
import { useRouter } from '@tanstack/react-router'
import type { ProfileId } from '../../domain/ids.ts'
import { type FixExport, FixNote, type PrNumber, type Skipped, openGamePrs, prUrl } from '../../domain/upstream.ts'
import { noteFixFn } from '../../fns/upstream.ts'
import { CajaCopiar } from '../../ui/compatibility/CopyBox.tsx'
import { ErrorCampo } from '../../ui/FieldError.tsx'
import { fecha } from '../../ui/format.ts'
import { Campo, campo } from '../../ui/form.tsx'
import { SelloEjemplo } from '../../ui/DemoStamp.tsx'
import { erroresDeRegla, useAccion } from '../../ui/useAction.ts'
import { motivoNoExportable, motivoOmision } from '../../ui/vocabulary.ts'

type Arreglo = { readonly pr: PrNumber; readonly registrado_en: Date }

/** "Compartir con umu-protonfixes" on an approved profile: its fix file, what did not translate, and the merged PRs it led to. */
export function CompartirUpstream({
  perfilId,
  exportacion: x,
  arreglos,
  revisor,
}: {
  perfilId: ProfileId
  exportacion: FixExport
  arreglos: ReadonlyArray<Arreglo>
  revisor: boolean
}) {
  return (
    <section className="bloque pila" aria-labelledby="upstream">
      <h2 id="upstream" className="titulo-seccion">
        Compartir con umu-protonfixes
      </h2>
      {x._tag === 'no_exportable' && <p className="tarjeta tenue">{motivoNoExportable[x.reason]}</p>}
      {x._tag === 'nada_traducible' && (
        <div className="tarjeta pila">
          <p>
            {x.skipped.length === 0
              ? 'Este perfil no tiene opciones de lanzamiento ni dependencias que se conviertan en un arreglo de umu-protonfixes.'
              : 'Nada de este perfil se convierte en un arreglo de umu-protonfixes:'}
          </p>
          <Omitidos omitidos={x.skipped} />
        </div>
      )}
      {x._tag === 'archivo' && (
        <>
          <p>
            umu-protonfixes aplica arreglos por juego cuando lo abres con GE-Proton o umu. Este perfil se traduce en el archivo{' '}
            <code>{x.path}</code>; puedes usarlo hoy mismo y proponerlo al proyecto para que llegue a todos.
          </p>
          <CajaCopiar etiqueta="Úsalo ya en tu PC" texto={x.local_command} />
          <p className="pequeno nota" data-tono="azul">
            Solo GE-Proton y umu leen esta carpeta; el Proton de Valve no.
          </p>
          <CajaCopiar etiqueta={`Archivo ${x.path}`} texto={x.content} />
          {x.skipped.length > 0 && (
            <div className="pila">
              <p className="pequeno">No pasó al archivo:</p>
              <Omitidos omitidos={x.skipped} />
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
                <SelloEjemplo /> Los datos de ejemplo no se envían a umu-protonfixes.
              </span>
            )}
          </p>
          {arreglos.length > 0 && (
            <ul className="lista-tarjetas">
              {arreglos.map((a) => (
                <li key={a.pr} className="tarjeta fila">
                  <a href={prUrl(a.pr)} target="_blank" rel="noreferrer">
                    Aceptado en umu-protonfixes · PR #{a.pr}
                  </a>
                  <span className="pequeno tenue">registrado el {fecha(a.registrado_en)}</span>
                  {revisor && <Anular pr={a.pr} />}
                </li>
              ))}
            </ul>
          )}
          {/* Keyed by the count so a recorded PR clears the field. */}
          {revisor && <RegistrarArreglo key={arreglos.length} perfilId={perfilId} />}
        </>
      )}
    </section>
  )
}

function Omitidos({ omitidos }: { omitidos: ReadonlyArray<Skipped> }) {
  return (
    <ul className="pequeno">
      {omitidos.map((o, i) => (
        <li key={i}>
          <code>{o.text}</code>: {motivoOmision[o.reason]}.
        </li>
      ))}
    </ul>
  )
}

function RegistrarArreglo({ perfilId }: { perfilId: ProfileId }) {
  const router = useRouter()
  const r = useAccion(FixNote, noteFixFn, { alFallar: erroresDeRegla, alCompletar: () => router.invalidate() })
  return (
    <form className="tarjeta formulario" {...r.formulario}>
      <ErrorCampo errores={r.errores} campo="formulario" />
      <input type="hidden" name="_tag" value="Aceptado" />
      <input type="hidden" name="perfil_id" value={perfilId} />
      <Campo errores={r.errores} nombre="pr" etiqueta="Registrar un PR fusionado (revisores)">
        <input {...campo(r.errores, 'pr')} placeholder="https://github.com/Open-Wine-Components/umu-protonfixes/pull/…" />
      </Campo>
      <p className="pequeno tenue">
        Solo PR ya fusionados: cada uno suma al contador público.{' '}
        <a href={openGamePrs} target="_blank" rel="noreferrer">
          Buscar PR fusionados de OpenGame
        </a>
      </p>
      <button type="submit" disabled={r.enviando}>
        {r.enviando ? 'Registrando…' : 'Registrar PR aceptado'}
      </button>
    </form>
  )
}

function Anular({ pr }: { pr: PrNumber }) {
  const router = useRouter()
  const r = useAccion(FixNote, noteFixFn, { alFallar: erroresDeRegla, alCompletar: () => router.invalidate() })
  return (
    <form className="fila" {...r.formulario}>
      <input type="hidden" name="_tag" value="Anular" />
      <input type="hidden" name="pr" value={pr} />
      <button type="submit" className="boton-secundario" disabled={r.enviando}>
        Anular
      </button>
      <ErrorCampo errores={r.errores} campo="formulario" />
    </form>
  )
}
