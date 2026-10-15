// Lives under routes/ rather than ui/ because the reviewer forms call a server fn, which ui/ may not import.
import { useRouter } from '@tanstack/react-router'
import type { PerfilId } from '../../dominio/ids.ts'
import { type ExportacionFix, NotaArreglo, type NumeroPr, type Omitido, prsDeOpenGame, urlPr } from '../../dominio/upstream.ts'
import { anotarArregloFn } from '../../fns/upstream.ts'
import { CajaCopiar } from '../../ui/compatibilidad/CajaCopiar.tsx'
import { ErrorCampo } from '../../ui/ErrorCampo.tsx'
import { fecha } from '../../ui/formato.ts'
import { Campo, campo } from '../../ui/formulario.tsx'
import { SelloEjemplo } from '../../ui/SelloEjemplo.tsx'
import { erroresDeRegla, useAccion } from '../../ui/useAccion.ts'
import { motivoNoExportable, motivoOmision } from '../../ui/vocabulario.ts'

type Arreglo = { readonly pr: NumeroPr; readonly registrado_en: Date }

/** "Compartir con umu-protonfixes" on an approved profile: its fix file, what did not translate, and the merged PRs it led to. */
export function CompartirUpstream({
  perfilId,
  exportacion: x,
  arreglos,
  revisor,
}: {
  perfilId: PerfilId
  exportacion: ExportacionFix
  arreglos: ReadonlyArray<Arreglo>
  revisor: boolean
}) {
  return (
    <section className="bloque pila" aria-labelledby="upstream">
      <h2 id="upstream" className="titulo-seccion">
        Compartir con umu-protonfixes
      </h2>
      {x._tag === 'no_exportable' && <p className="tarjeta tenue">{motivoNoExportable[x.motivo]}</p>}
      {x._tag === 'nada_traducible' && (
        <div className="tarjeta pila">
          <p>
            {x.omitidos.length === 0
              ? 'Este perfil no tiene opciones de lanzamiento ni dependencias que se conviertan en un arreglo de umu-protonfixes.'
              : 'Nada de este perfil se convierte en un arreglo de umu-protonfixes:'}
          </p>
          <Omitidos omitidos={x.omitidos} />
        </div>
      )}
      {x._tag === 'archivo' && (
        <>
          <p>
            umu-protonfixes aplica arreglos por juego cuando lo abres con GE-Proton o umu. Este perfil se traduce en el archivo{' '}
            <code>{x.ruta}</code>; puedes usarlo hoy mismo y proponerlo al proyecto para que llegue a todos.
          </p>
          <CajaCopiar etiqueta="Úsalo ya en tu PC" texto={x.comando_local} />
          <p className="pequeno nota" data-tono="azul">
            Solo GE-Proton y umu leen esta carpeta; el Proton de Valve no.
          </p>
          <CajaCopiar etiqueta={`Archivo ${x.ruta}`} texto={x.contenido} />
          {x.omitidos.length > 0 && (
            <div className="pila">
              <p className="pequeno">No pasó al archivo:</p>
              <Omitidos omitidos={x.omitidos} />
            </div>
          )}
          <p className="fila">
            <a href={x.ver_existente} target="_blank" rel="noreferrer">
              ¿Ya existe un arreglo? Revísalo primero
            </a>
            {x.proponer._tag === 'enlace' ? (
              <a className="boton" href={x.proponer.url} target="_blank" rel="noreferrer">
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
                  <a href={urlPr(a.pr)} target="_blank" rel="noreferrer">
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

function Omitidos({ omitidos }: { omitidos: ReadonlyArray<Omitido> }) {
  return (
    <ul className="pequeno">
      {omitidos.map((o, i) => (
        <li key={i}>
          <code>{o.texto}</code>: {motivoOmision[o.motivo]}.
        </li>
      ))}
    </ul>
  )
}

function RegistrarArreglo({ perfilId }: { perfilId: PerfilId }) {
  const router = useRouter()
  const r = useAccion(NotaArreglo, anotarArregloFn, { alFallar: erroresDeRegla, alCompletar: () => router.invalidate() })
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
        <a href={prsDeOpenGame} target="_blank" rel="noreferrer">
          Buscar PR fusionados de OpenGame
        </a>
      </p>
      <button type="submit" disabled={r.enviando}>
        {r.enviando ? 'Registrando…' : 'Registrar PR aceptado'}
      </button>
    </form>
  )
}

function Anular({ pr }: { pr: NumeroPr }) {
  const router = useRouter()
  const r = useAccion(NotaArreglo, anotarArregloFn, { alFallar: erroresDeRegla, alCompletar: () => router.invalidate() })
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
