import { createFileRoute, Link } from '@tanstack/react-router'
import { ProfileId } from '../../domain/ids.ts'
import { canReview } from '../../domain/review.ts'
import { profileFn } from '../../fns/catalog.ts'
import { CopyBox } from '../../ui/compatibility/CopyBox.tsx'
import { EvaluationChecklist } from '../../ui/compatibility/EvaluationChecklist.tsx'
import { MachinePanel } from '../../ui/compatibility/VerdictForMe.tsx'
import { date, memory } from '../../ui/format.ts'
import { Chip, Badge } from '../../ui/Badge.tsx'
import { useProgress } from '../../ui/progress.ts'
import { DemoStamp } from '../../ui/DemoStamp.tsx'
import { reviewStatus } from '../../ui/vocabulary.ts'
import { routeIdParser } from '../-ids.ts'
import { ShareUpstream } from './-upstream.tsx'

const profileId = routeIdParser(ProfileId)

export const Route = createFileRoute('/perfiles/$profileId')({
  params: { parse: (p) => ({ profileId: profileId(p.profileId) }), stringify: (p) => ({ profileId: String(p.profileId) }) },
  loader: ({ params }) => profileFn({ data: params }),
  head: ({ loaderData }) => ({ meta: [{ title: loaderData ? `${loaderData.profile.title} · OpenGame Linux` : 'OpenGame Linux' }] }),
  component: ProfilePage,
})

const undeclared = <span className="tenue">no declarada</span>

const noEvaluationReason = {
  perfil_en_prueba: 'Tu equipo se compara solo con perfiles aprobados.',
  sin_diagnostico: 'Sin diagnóstico. Ejecuta el detector para comparar tu RAM, VRAM y Vulkan con este perfil.',
} as const

function ProfilePage() {
  const { profile: p, steps, dependencies, evaluation, fixExport, fixes } = Route.useLoaderData()
  const { visitor } = Route.useRouteContext()
  const approved = p.review_status === 'aprobado'
  return (
    <main className="envoltura">
      <header className="pila">
        <div className="migas">
          <Link to="/">Catálogo</Link> / <Link to="/juegos/$gameId" params={{ gameId: p.game_id }}>{p.game}</Link> / Perfil
        </div>
        <h1 className="titulo-juego">
          {p.title} <span className="tenue">r{p.revision}</span>
        </h1>
        <div className="fila">
          {approved ? <Badge label={reviewStatus.aprobado} /> : <Chip tone="gris">en prueba</Chip>}
          <span className="pequeno tenue">
            {approved && p.reviewed_at ? `Aprobado el ${date(p.reviewed_at)}` : 'Pendiente de revisión'} · autor {p.author}
          </span>
          {p.demo && <DemoStamp />}
        </div>
        <div className="fila-chips">
          <span className="chip">{p.launcher}</span>
          <span className="chip">{p.distribution}</span>
          <span className="chip">{p.layer}</span>
          <span className="chip">{p.architecture}</span>
          {p.target_game_version && <span className="chip">versión del juego {p.target_game_version}</span>}
        </div>
        {!approved && (
          <p className="pequeno nota" data-tono="amarillo">
            Este perfil aún no está aprobado. Puedes probarlo: un reporte aprobado con resultado funcional es lo que su
            aprobación necesita.
          </p>
        )}
        <p className="pequeno nota" data-tono="azul">
          OpenGame no descarga ni ejecuta nada. Sigue los pasos tú mismo; los comandos se copian tal cual.
        </p>
        <p>
          <Link to="/juegos/$gameId/reportar" params={{ gameId: p.game_id }} search={{ perfil: p.id }} className="boton">
            Reportar resultado con este perfil
          </Link>
        </p>
      </header>

      <div className="rejilla-2">
        <div>
          <h2 className="titulo-seccion">Pasos</h2>
          {steps.length === 0 ? (
            <p className="tarjeta tenue">Este perfil no tiene pasos.</p>
          ) : (
            <StepList storageKey={`opengame:perfil:${p.id}:r${p.revision}:pasos`} steps={steps} />
          )}
          {p.launch_options && (
            <div className="bloque">
              <CopyBox label="Parámetros de lanzamiento" text={p.launch_options} />
            </div>
          )}
          <h2 className="titulo-seccion">Dependencias</h2>
          {dependencies.length === 0 ? (
            <p className="tarjeta tenue">No necesita dependencias adicionales.</p>
          ) : (
            <ul className="lista-tarjetas">
              {dependencies.map((d) => (
                <li key={`${d.package_manager}/${d.name}`} className="tarjeta pila">
                  <div className="fila">
                    <b className="dato">{d.name}</b>
                    <span className="chip">{d.package_manager}</span>
                    <Chip tone={d.required ? 'amarillo' : 'gris'}>{d.required ? 'obligatoria' : 'opcional'}</Chip>
                    {d.required_version && <span className="chip">versión {d.required_version}</span>}
                  </div>
                  <p className="pequeno tenue">{d.description}</p>
                  <CopyBox label={`Instalar ${d.name}`} text={d.install_instruction} />
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
                  <td>{p.ram_min_mb === null ? undeclared : memory(p.ram_min_mb)}</td>
                </tr>
                <tr>
                  <th scope="row">VRAM mínima</th>
                  <td>{p.vram_min_mb === null ? undeclared : memory(p.vram_min_mb)}</td>
                </tr>
                <tr>
                  <th scope="row">Vulkan</th>
                  <td>
                    {p.requires_vulkan === null
                      ? undeclared
                      : p.requires_vulkan
                        ? `obligatorio${p.vulkan_version_min ? `, ${p.vulkan_version_min} o superior` : ''}`
                        : 'no lo necesita'}
                  </td>
                </tr>
                <tr>
                  <th scope="row">CPU</th>
                  <td>{p.cpu_requirement ?? undeclared}</td>
                </tr>
                <tr>
                  <th scope="row">GPU</th>
                  <td>{p.gpu_requirement ?? undeclared}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="bloque">
            <MachinePanel>
              {typeof evaluation === 'string' ? (
                <p className="pequeno tenue">{noEvaluationReason[evaluation]}</p>
              ) : (
                <EvaluationChecklist profile={{ title: p.title, revision: p.revision, evaluation }} />
              )}
            </MachinePanel>
          </div>
        </div>
      </div>

      {fixExport !== null && (
        <ShareUpstream
          profileId={p.id}
          fixExport={fixExport}
          fixes={fixes}
          reviewer={visitor !== null && canReview[visitor.role]}
        />
      )}
    </main>
  )
}

type Step = Awaited<ReturnType<typeof profileFn>>['steps'][number]

function StepList({ storageKey, steps }: { storageKey: string; steps: ReadonlyArray<Step> }) {
  const { done, toggle, reset } = useProgress(storageKey)
  const doneCount = steps.filter((s) => done.includes(s.position)).length
  return (
    <>
      <div className="fila pequeno">
        <span className="tenue" aria-live="polite">
          {doneCount} de {steps.length} pasos hechos · se guarda solo en este navegador
        </span>
        {doneCount > 0 && (
          <button type="button" className="boton-secundario" onClick={reset}>
            Reiniciar
          </button>
        )}
      </div>
      <ol className="pasos">
        {steps.map((s) => (
          <li key={s.position} className="tarjeta pila" data-hecho={done.includes(s.position) || undefined}>
            <b>{s.title}</b>
            <p className="texto-largo">{s.instruction}</p>
            <label className="casilla pequeno">
              <input type="checkbox" checked={done.includes(s.position)} onChange={() => toggle(s.position)} />
              Hecho
            </label>
          </li>
        ))}
      </ol>
    </>
  )
}
