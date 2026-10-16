import { createFileRoute, Link } from '@tanstack/react-router'
import { Option, Schema } from 'effect'
import { useEffect, useState } from 'react'
import { TargetMachine } from '../../domain/contributions.ts'
import { Checkbox, type DiagnosticId } from '../../domain/ids.ts'
import { evaluateDiagnosticFn, saveDiagnosticFn, myMachinesFn } from '../../fns/diagnostic.ts'
import { Distribuciones } from '../../ui/diagnostics/Distributions.tsx'
import { JuegosDelEquipo } from '../../ui/diagnostics/MachineGames.tsx'
import { ResumenCaptura } from '../../ui/diagnostics/CaptureSummary.tsx'
import { TarjetaGraficaEnLinux } from '../../ui/diagnostics/GraphicsCardOnLinux.tsx'
import { ErrorCampo } from '../../ui/FieldError.tsx'
import { campo } from '../../ui/form.tsx'
import { useAccion } from '../../ui/useAction.ts'
import { motivoPayload } from '../../ui/vocabulary.ts'
import { type Entrada, guardarPendiente, leerPendiente, olvidarPendiente } from './-input.ts'

export const Route = createFileRoute('/diagnostico/importar')({
  ssr: false,
  head: () => ({ meta: [{ title: 'Tu diagnóstico · OpenGame Linux' }] }),
  loader: () => myMachinesFn(),
  component: Importar,
})

type Evaluado = Awaited<ReturnType<typeof evaluateDiagnosticFn>>

const tomarFragmento = () => {
  const { hash, pathname, search } = window.location
  if (!hash.startsWith('#d=')) return
  guardarPendiente({ _tag: 'detector', texto: hash.slice('#d='.length) })
  history.replaceState(history.state, '', pathname + search)
}

function Importar() {
  const [estado, setEstado] = useState<{ readonly entrada: Entrada; readonly evaluado: Evaluado | null } | 'vacio' | null>(null)

  useEffect(() => {
    tomarFragmento()
    const pendiente = leerPendiente()
    if (Option.isNone(pendiente)) return setEstado('vacio')
    const entrada = pendiente.value
    setEstado({ entrada, evaluado: null })
    void evaluateDiagnosticFn({ data: entrada }).then((evaluado) => setEstado({ entrada, evaluado }))
  }, [])

  if (estado === 'vacio')
    return (
      <main className="envoltura pila">
        <h1>No hay un diagnóstico para mostrar</h1>
        <p className="tenue">
          Ejecuta el detector con <code>--open</code>, o pega su salida en <Link to="/diagnostico">Diagnóstico</Link>.
        </p>
      </main>
    )
  if (estado === null || estado.evaluado === null)
    return (
      <main className="envoltura">
        <p role="status">Leyendo tu equipo…</p>
      </main>
    )
  const r = estado.evaluado
  if (!r.ok)
    return (
      <main className="envoltura pila">
        <h1>No pudimos leer este diagnóstico</h1>
        <p role="alert">
          {motivoPayload[r.error.reason]}
          {r.error.field !== null && <span className="dato"> ({r.error.field})</span>}
        </p>
        <Link to="/diagnostico">Volver a Diagnóstico</Link>
      </main>
    )
  return (
    <main className="envoltura pila">
      <h1>Tu equipo frente al catálogo</h1>
      <p className="tenue">
        Esta evaluación no se ha guardado. Compara RAM, VRAM y Vulkan con el perfil aprobado sugerido para cada juego; no
        predice FPS.
      </p>
      <ResumenCaptura captura={r.value.capture} />
      <TarjetaGraficaEnLinux equipo={r.value.machine} pci={r.value.capture.gpu_pci_id} />
      <Guardar entrada={estado.entrada} juegosEnBiblioteca={r.value.library?.total ?? 0} />
      <JuegosDelEquipo filas={r.value.matrix} biblioteca={r.value.library} orientativa={r.value.capture.sistema === 'Windows'} />
      <Distribuciones {...r.value.distributions} />
    </main>
  )
}

const Destino = Schema.Struct({ equipo: TargetMachine, con_biblioteca: Checkbox })
type Guardado = { readonly id: DiagnosticId; readonly nuevo: boolean }

function Guardar({ entrada, juegosEnBiblioteca }: { entrada: Entrada; juegosEnBiblioteca: number }) {
  const { visitante } = Route.useRouteContext()
  const equipos = Route.useLoaderData()
  const [destino, setDestino] = useState(() => (equipos[0] === undefined ? 'nuevo' : String(equipos[0].id)))
  const [guardado, setGuardado] = useState<Guardado | null>(null)
  const r = useAccion(Destino, ({ data }) => saveDiagnosticFn({ data: { equipo: data.equipo, con_biblioteca: data.con_biblioteca, entrada } }), {
    alFallar: (f) =>
      f._tag === 'ReglaIncumplida'
        ? { 'equipo[id]': 'Ese equipo no es tuyo. Elige uno de tu lista.' }
        : { formulario: motivoPayload[f.reason] },
    alCompletar: (valor) => {
      olvidarPendiente()
      setGuardado(valor)
    },
  })

  if (visitante === null)
    return (
      <section className="tarjeta fila" aria-label="Guardar">
        <span>Para guardar este diagnóstico en tu equipo necesitas una cuenta.</span>
        <Link to="/entrar" search={{ volver: '/diagnostico/importar' }} className="boton">
          Entrar para guardar
        </Link>
        <Link to="/registro" search={{ volver: '/diagnostico/importar' }}>
          Crear cuenta
        </Link>
      </section>
    )

  return (
    <section className="tarjeta" aria-label="Guardar">
      <form className="pila" {...r.formulario}>
        <div className="fila">
          <input type="hidden" name="equipo[_tag]" value={destino === 'nuevo' ? 'nuevo' : 'existente'} />
          <label htmlFor="equipo[id]">Guardar en</label>
          <select {...campo(r.errores, 'equipo[id]')} value={destino} onChange={(e) => setDestino(e.currentTarget.value)}>
            {equipos.map((e) => (
              <option key={e.id} value={e.id}>
                {e.alias}
              </option>
            ))}
            <option value="nuevo">Un equipo nuevo…</option>
          </select>
          {destino === 'nuevo' && (
            <input
              {...campo(r.errores, 'equipo[alias]')}
              aria-label="Nombre del equipo nuevo"
              defaultValue={equipos.length === 0 ? 'Mi equipo' : ''}
              placeholder="Portátil del trabajo"
            />
          )}
          <button type="submit" disabled={r.enviando}>
            {r.enviando ? 'Guardando…' : 'Guardar en mi equipo'}
          </button>
        </div>
        {juegosEnBiblioteca > 0 && (
          <label className="casilla">
            <input type="checkbox" name="con_biblioteca" value="true" />
            Guardar también mi lista de juegos de Steam ({juegosEnBiblioteca}). Solo tú la ves.
          </label>
        )}
      </form>
      <ErrorCampo errores={r.errores} campo="equipo[id]" />
      <ErrorCampo errores={r.errores} campo="equipo[alias]" />
      <ErrorCampo errores={r.errores} campo="formulario" />
      {guardado && (
        <p role="status" className="pequeno">
          {guardado.nuevo ? 'Guardado.' : 'Ya estaba guardado; no se creó una copia.'}{' '}
          <Link to="/diagnosticos/$diagnosticoId" params={{ diagnosticoId: guardado.id }}>
            Ver el diagnóstico guardado
          </Link>
        </p>
      )}
    </section>
  )
}
