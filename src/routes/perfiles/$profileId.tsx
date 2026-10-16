import { createFileRoute, Link } from '@tanstack/react-router'
import { ProfileId } from '../../domain/ids.ts'
import { canReview } from '../../domain/review.ts'
import { profileFn } from '../../fns/catalog.ts'
import { CajaCopiar } from '../../ui/compatibility/CopyBox.tsx'
import { ChecklistEvaluacion } from '../../ui/compatibility/EvaluationChecklist.tsx'
import { PanelEquipo } from '../../ui/compatibility/VerdictForMe.tsx'
import { fecha, memoria } from '../../ui/format.ts'
import { Chip, Insignia } from '../../ui/Badge.tsx'
import { useProgreso } from '../../ui/progress.ts'
import { SelloEjemplo } from '../../ui/DemoStamp.tsx'
import { estadoRevision } from '../../ui/vocabulary.ts'
import { idDeRuta } from '../-ids.ts'
import { CompartirUpstream } from './-upstream.tsx'

const profileId = idDeRuta(ProfileId)

export const Route = createFileRoute('/perfiles/$profileId')({
  params: { parse: (p) => ({ profileId: profileId(p.profileId) }), stringify: (p) => ({ profileId: String(p.profileId) }) },
  loader: ({ params }) => profileFn({ data: params }),
  head: ({ loaderData }) => ({ meta: [{ title: loaderData ? `${loaderData.profile.titulo} · OpenGame Linux` : 'OpenGame Linux' }] }),
  component: Perfil,
})

const noDeclarada = <span className="tenue">no declarada</span>

const sinEvaluacion = {
  perfil_en_prueba: 'Tu equipo se compara solo con perfiles aprobados.',
  sin_diagnostico: 'Sin diagnóstico. Ejecuta el detector para comparar tu RAM, VRAM y Vulkan con este perfil.',
} as const

function Perfil() {
  const { profile: p, steps: pasos, dependencies: dependencias, evaluation: evaluacion, fixExport: exportacion, fixes: arreglos } = Route.useLoaderData()
  const { visitante } = Route.useRouteContext()
  const aprobado = p.estado_revision === 'aprobado'
  return (
    <main className="envoltura">
      <header className="pila">
        <div className="migas">
          <Link to="/">Catálogo</Link> / <Link to="/juegos/$gameId" params={{ gameId: p.juego_id }}>{p.juego}</Link> / Perfil
        </div>
        <h1 className="titulo-juego">
          {p.titulo} <span className="tenue">r{p.revision}</span>
        </h1>
        <div className="fila">
          {aprobado ? <Insignia etiqueta={estadoRevision.aprobado} /> : <Chip tono="gris">en prueba</Chip>}
          <span className="pequeno tenue">
            {aprobado && p.revisado_en ? `Aprobado el ${fecha(p.revisado_en)}` : 'Pendiente de revisión'} · autor {p.autor}
          </span>
          {p.ejemplo && <SelloEjemplo />}
        </div>
        <div className="fila-chips">
          <span className="chip">{p.lanzador}</span>
          <span className="chip">{p.distribucion}</span>
          <span className="chip">{p.capa}</span>
          <span className="chip">{p.arquitectura}</span>
          {p.version_juego_objetivo && <span className="chip">versión del juego {p.version_juego_objetivo}</span>}
        </div>
        {!aprobado && (
          <p className="pequeno nota" data-tono="amarillo">
            Este perfil aún no está aprobado. Puedes probarlo: un reporte aprobado con resultado funcional es lo que su
            aprobación necesita.
          </p>
        )}
        <p className="pequeno nota" data-tono="azul">
          OpenGame no descarga ni ejecuta nada. Sigue los pasos tú mismo; los comandos se copian tal cual.
        </p>
        <p>
          <Link to="/juegos/$gameId/reportar" params={{ gameId: p.juego_id }} search={{ perfil: p.id }} className="boton">
            Reportar resultado con este perfil
          </Link>
        </p>
      </header>

      <div className="rejilla-2">
        <div>
          <h2 className="titulo-seccion">Pasos</h2>
          {pasos.length === 0 ? (
            <p className="tarjeta tenue">Este perfil no tiene pasos.</p>
          ) : (
            <Pasos clave={`opengame:perfil:${p.id}:r${p.revision}:pasos`} pasos={pasos} />
          )}
          {p.parametros_lanzamiento && (
            <div className="bloque">
              <CajaCopiar etiqueta="Parámetros de lanzamiento" texto={p.parametros_lanzamiento} />
            </div>
          )}
          <h2 className="titulo-seccion">Dependencias</h2>
          {dependencias.length === 0 ? (
            <p className="tarjeta tenue">No necesita dependencias adicionales.</p>
          ) : (
            <ul className="lista-tarjetas">
              {dependencias.map((d) => (
                <li key={`${d.gestor}/${d.nombre}`} className="tarjeta pila">
                  <div className="fila">
                    <b className="dato">{d.nombre}</b>
                    <span className="chip">{d.gestor}</span>
                    <Chip tono={d.obligatoria ? 'amarillo' : 'gris'}>{d.obligatoria ? 'obligatoria' : 'opcional'}</Chip>
                    {d.version_requerida && <span className="chip">versión {d.version_requerida}</span>}
                  </div>
                  <p className="pequeno tenue">{d.descripcion}</p>
                  <CajaCopiar etiqueta={`Instalar ${d.nombre}`} texto={d.instruccion_instalacion} />
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <h2 className="titulo-seccion">Condiciones conocidas</h2>
          <div className="tarjeta">
            <table className="checklist">
              <caption className="solo-lector">Condiciones conocidas del perfil</caption>
              <tbody>
                <tr>
                  <th scope="row">RAM mínima</th>
                  <td>{p.ram_min_mb === null ? noDeclarada : memoria(p.ram_min_mb)}</td>
                </tr>
                <tr>
                  <th scope="row">VRAM mínima</th>
                  <td>{p.vram_min_mb === null ? noDeclarada : memoria(p.vram_min_mb)}</td>
                </tr>
                <tr>
                  <th scope="row">Vulkan</th>
                  <td>
                    {p.requiere_vulkan === null
                      ? noDeclarada
                      : p.requiere_vulkan
                        ? `obligatorio${p.version_vulkan_min ? `, ${p.version_vulkan_min} o superior` : ''}`
                        : 'no lo necesita'}
                  </td>
                </tr>
                <tr>
                  <th scope="row">CPU</th>
                  <td>{p.condicion_cpu ?? noDeclarada}</td>
                </tr>
                <tr>
                  <th scope="row">GPU</th>
                  <td>{p.condicion_gpu ?? noDeclarada}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="bloque">
            <PanelEquipo>
              {typeof evaluacion === 'string' ? (
                <p className="pequeno tenue">{sinEvaluacion[evaluacion]}</p>
              ) : (
                <ChecklistEvaluacion perfil={{ titulo: p.titulo, revision: p.revision, evaluation: evaluacion }} />
              )}
            </PanelEquipo>
          </div>
        </div>
      </div>

      {exportacion !== null && (
        <CompartirUpstream
          profileId={p.id}
          exportacion={exportacion}
          arreglos={arreglos}
          revisor={visitante !== null && canReview[visitante.rol]}
        />
      )}
    </main>
  )
}

type Paso = ReturnType<typeof Route.useLoaderData>['pasos'][number]

function Pasos({ clave, pasos }: { clave: string; pasos: ReadonlyArray<Paso> }) {
  const { hechos, alternar, reiniciar } = useProgreso(clave)
  const cuenta = pasos.filter((s) => hechos.includes(s.orden)).length
  return (
    <>
      <div className="fila pequeno">
        <span className="tenue" aria-live="polite">
          {cuenta} de {pasos.length} pasos hechos · se guarda solo en este navegador
        </span>
        {cuenta > 0 && (
          <button type="button" className="boton-secundario" onClick={reiniciar}>
            Reiniciar
          </button>
        )}
      </div>
      <ol className="pasos">
        {pasos.map((s) => (
          <li key={s.orden} className="tarjeta pila" data-hecho={hechos.includes(s.orden) || undefined}>
            <b>{s.titulo}</b>
            <p className="texto-largo">{s.instruccion}</p>
            <label className="casilla pequeno">
              <input type="checkbox" checked={hechos.includes(s.orden)} onChange={() => alternar(s.orden)} />
              Hecho
            </label>
          </li>
        ))}
      </ol>
    </>
  )
}
