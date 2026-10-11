import { createFileRoute, notFound, redirect, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { NuevoJuego } from '../../dominio/aportes.ts'
import { crearJuegoFn, opcionesJuegoFn } from '../../fns/aportes.ts'
import { ErrorCampo } from '../../ui/ErrorCampo.tsx'
import { Campo, campo } from '../../ui/formulario.tsx'
import { erroresDeRegla, useAccion } from '../../ui/useAccion.ts'
import { volverAqui } from '../-volver.ts'

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

        <button type="submit" disabled={r.enviando}>
          Crear juego
        </button>
      </form>
    </main>
  )
}
