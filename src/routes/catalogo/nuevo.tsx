import { createFileRoute, notFound, redirect, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { NuevoJuego } from '../../dominio/aportes.ts'
import { ApiGrafica } from '../../dominio/literales.ts'
import type { NivelX86 } from '../../dominio/plataforma.ts'
import { crearJuegoFn, opcionesJuegoFn } from '../../fns/aportes.ts'
import { ErrorCampo } from '../../ui/ErrorCampo.tsx'
import { Campo, campo, nulo } from '../../ui/formulario.tsx'
import { erroresDeRegla, useAccion } from '../../ui/useAccion.ts'
import { apiGrafica, nivelX86 } from '../../ui/vocabulario.ts'
import { volverAqui } from '../-volver.ts'

// v1 is every x86-64 CPU, so it is no requirement.
const nivelesMinimos = ['v2', 'v3', 'v4'] as const satisfies ReadonlyArray<NivelX86>

export const Route = createFileRoute('/catalogo/nuevo')({
  beforeLoad: ({ context, location }) => {
    if (context.visitante === null) throw redirect({ to: '/entrar', search: volverAqui(location) })
    if (context.visitante.rol === 'usuario') throw notFound()
  },
  loader: () => opcionesJuegoFn(),
  head: () => ({ meta: [{ title: 'Nuevo juego · OpenGame Linux' }] }),
  component: NuevoJuegoPagina,
})

function NuevoJuegoPagina() {
  const { lanzadores } = Route.useLoaderData()
  const navegar = useNavigate()
  // Row keys, not indexes: removing a middle edition must not shift what the other rows show.
  const [ediciones, setEdiciones] = useState<ReadonlyArray<number>>([0])
  const [siguiente, setSiguiente] = useState(1)
  const r = useAccion(NuevoJuego, crearJuegoFn, {
    alFallar: erroresDeRegla,
    alCompletar: ({ id }) => void navegar({ to: '/juegos/$juegoId', params: { juegoId: id } }),
  })

  const agregar = () => {
    setEdiciones([...ediciones, siguiente])
    setSiguiente(siguiente + 1)
  }

  return (
    <main className="envoltura">
      <p className="rotulo">Catálogo</p>
      <h1>Nuevo juego</h1>
      <form className="tarjeta formulario formulario-ancho" {...r.formulario}>
        <ErrorCampo errores={r.errores} campo="formulario" />
        <Campo errores={r.errores} nombre="titulo" etiqueta="Título">
          <input {...campo(r.errores, 'titulo')} />
        </Campo>
        <Campo errores={r.errores} nombre="descripcion" etiqueta="Descripción">
          <textarea {...campo(r.errores, 'descripcion')} />
        </Campo>

        <fieldset className="grupo">
          <legend>Ediciones</legend>
          <p className="pequeno tenue">Una por lanzador. El identificador es el de la tienda (por ejemplo, el App ID de Steam), si lo conoces.</p>
          {ediciones.map((clave, i) => (
            <div key={clave} className="fila campos-en-linea">
              <Campo errores={r.errores} nombre={`ediciones[${i}][lanzador_id]`} etiqueta="Lanzador">
                <select {...campo(r.errores, `ediciones[${i}][lanzador_id]`)} defaultValue={lanzadores[i % lanzadores.length]?.id}>
                  {lanzadores.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.nombre}
                    </option>
                  ))}
                </select>
              </Campo>
              <Campo errores={r.errores} nombre={`ediciones[${i}][identificador_externo]`} etiqueta="Identificador (opcional)">
                <input {...campo(r.errores, `ediciones[${i}][identificador_externo]`)} />
              </Campo>
              <button
                type="button"
                className="boton-secundario"
                disabled={ediciones.length === 1}
                onClick={() => setEdiciones(ediciones.filter((e) => e !== clave))}
              >
                Quitar
              </button>
            </div>
          ))}
          <p>
            <button type="button" className="boton-secundario" onClick={agregar} disabled={ediciones.length >= lanzadores.length}>
              Añadir una edición
            </button>
          </p>
          <ErrorCampo errores={r.errores} campo="ediciones" />
        </fieldset>

        <fieldset className="grupo">
          <legend>APIs gráficas</legend>
          <p className="pequeno tenue">Marca cada API con la que el juego puede dibujar, aunque sea un modo alternativo.</p>
          <div className="fila">
            {ApiGrafica.literals.map((api) => (
              <label key={api} className="casilla">
                <input type="checkbox" name="apis[]" value={api} />
                {apiGrafica[api]}
              </label>
            ))}
          </div>
          <ErrorCampo errores={r.errores} campo="apis" />
        </fieldset>

        <Campo errores={r.errores} nombre="nivel_x86_min" etiqueta="CPU mínima" ayuda="Solo si el juego exige un conjunto de instrucciones, como SSE4.2 en Counter-Strike 2.">
          <select {...campo(r.errores, 'nivel_x86_min')} defaultValue={nulo}>
            <option value={nulo}>Sin requisito</option>
            {nivelesMinimos.map((n) => (
              <option key={n} value={n}>
                {nivelX86[n]}
              </option>
            ))}
          </select>
        </Campo>

        <button type="submit" disabled={r.enviando}>
          Crear juego
        </button>
      </form>
    </main>
  )
}
