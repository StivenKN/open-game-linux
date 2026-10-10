// Result page for an unsaved capture: where `opengame-detect.sh --open` lands
// ($ORIGEN/diagnostico/importar#d=<base64url>) and where /diagnostico sends the pasted or manual entry.
// The fragment never reaches the server on navigation. This page strips it from the address bar,
// keeps the raw string in sessionStorage (a guest can sign in and come back), and posts it untouched
// to the server, the only parser. Nothing is stored until "Guardar en mi equipo".
import { createFileRoute, Link } from '@tanstack/react-router'
import { Option, Schema } from 'effect'
import { useEffect, useState } from 'react'
import { EquipoDestino } from '../../dominio/aportes.ts'
import { evaluarDiagnosticoFn, guardarDiagnosticoFn, misEquiposFn } from '../../fns/diagnostico.ts'
import { MatrizDiagnostico } from '../../ui/diagnostico/MatrizDiagnostico.tsx'
import { ResumenCaptura } from '../../ui/diagnostico/ResumenCaptura.tsx'
import { ErrorCampo, idError } from '../../ui/ErrorCampo.tsx'
import { useAccion } from '../../ui/useAccion.ts'
import { motivoPayload } from '../../ui/vocabulario.ts'
import { type Entrada, guardarPendiente, leerPendiente, olvidarPendiente } from './-entrada.ts'

export const Route = createFileRoute('/diagnostico/importar')({
  ssr: false,
  head: () => ({ meta: [{ title: 'Tu diagnóstico · OpenGame Linux' }] }),
  loader: () => misEquiposFn(),
  component: Importar,
})

type Evaluado = Awaited<ReturnType<typeof evaluarDiagnosticoFn>>

/** Moves a `#d=` fragment into sessionStorage, as is, and removes it from the address bar and history. */
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
    void evaluarDiagnosticoFn({ data: entrada }).then((evaluado) => setEstado({ entrada, evaluado }))
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
          {motivoPayload[r.fallo.motivo]}
          {r.fallo.campo !== null && <span className="dato"> ({r.fallo.campo})</span>}
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
      <ResumenCaptura captura={r.valor.captura} />
      <Guardar entrada={estado.entrada} />
      <h2 className="titulo-seccion">Juegos</h2>
      <MatrizDiagnostico filas={r.valor.matriz} />
    </main>
  )
}

const Destino = Schema.Struct({ equipo: EquipoDestino })
type Guardado = { readonly id: number; readonly nuevo: boolean }

/** "Guardar en mi equipo": needs an account; a guest goes to sign in and comes back to this page. */
function Guardar({ entrada }: { entrada: Entrada }) {
  const { visitante } = Route.useRouteContext()
  const equipos = Route.useLoaderData()
  const [destino, setDestino] = useState(() => (equipos[0] === undefined ? 'nuevo' : String(equipos[0].id)))
  const [guardado, setGuardado] = useState<Guardado | null>(null)
  const r = useAccion(Destino, ({ data }) => guardarDiagnosticoFn({ data: { equipo: data.equipo, entrada } }), {
    alFallar: (f) =>
      f._tag === 'ReglaIncumplida'
        ? { 'equipo[id]': 'Ese equipo no es tuyo. Elige uno de tu lista.' }
        : { formulario: motivoPayload[f.motivo] },
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
      <form className="fila" onSubmit={r.enviar} noValidate>
        <input type="hidden" name="equipo[_tag]" value={destino === 'nuevo' ? 'nuevo' : 'existente'} />
        <label htmlFor="equipo[id]">Guardar en</label>
        <select
          id="equipo[id]"
          name="equipo[id]"
          value={destino}
          onChange={(e) => setDestino(e.currentTarget.value)}
          aria-invalid={r.errores['equipo[id]'] !== undefined}
          aria-describedby={idError('equipo[id]')}
        >
          {equipos.map((e) => (
            <option key={e.id} value={e.id}>
              {e.alias}
            </option>
          ))}
          <option value="nuevo">Un equipo nuevo…</option>
        </select>
        {destino === 'nuevo' && (
          <input
            name="equipo[alias]"
            aria-label="Nombre del equipo nuevo"
            defaultValue={equipos.length === 0 ? 'Mi equipo' : ''}
            placeholder="Portátil del trabajo"
            aria-invalid={r.errores['equipo[alias]'] !== undefined}
            aria-describedby={idError('equipo[alias]')}
          />
        )}
        <button type="submit" disabled={r.enviando}>
          {r.enviando ? 'Guardando…' : 'Guardar en mi equipo'}
        </button>
      </form>
      <ErrorCampo errores={r.errores} campo="equipo[id]" />
      <ErrorCampo errores={r.errores} campo="equipo[alias]" />
      <ErrorCampo errores={r.errores} campo="formulario" />
      {guardado && (
        <p role="status" className="pequeno">
          {guardado.nuevo ? 'Guardado.' : 'Ya estaba guardado; no se creó una copia.'}{' '}
          <Link to="/diagnosticos/$diagnosticoId" params={{ diagnosticoId: String(guardado.id) }}>
            Ver el diagnóstico guardado
          </Link>
        </p>
      )}
    </section>
  )
}
