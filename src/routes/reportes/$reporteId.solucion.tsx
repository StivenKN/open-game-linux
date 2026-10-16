import { createFileRoute, Link, redirect } from '@tanstack/react-router'
import { Schema } from 'effect'
import { useState } from 'react'
import { NewSolution } from '../../domain/contributions.ts'
import { ReportId, FailureTypeId } from '../../domain/ids.ts'
import { opcionesSolucionFn, registrarSolucionFn } from '../../fns/contributions.ts'
import { ErrorCampo } from '../../ui/FieldError.tsx'
import { momento } from '../../ui/format.ts'
import { Campo, campo, nulo } from '../../ui/form.tsx'
import { Insignia } from '../../ui/Badge.tsx'
import { erroresDeRegla, useAccion } from '../../ui/useAction.ts'
import { estadoRevision, resultado, tipoFallo } from '../../ui/vocabulary.ts'
import { idDeRuta } from '../-ids.ts'
import { volverAqui } from '../-return-to.ts'

const reporteId = idDeRuta(ReportId)

export const Route = createFileRoute('/reportes/$reporteId/solucion')({
  params: { parse: (p) => ({ reporteId: reporteId(p.reporteId) }), stringify: (p) => ({ reporteId: String(p.reporteId) }) },
  validateSearch: Schema.toStandardSchemaV1(Schema.Struct({ tipoFallo: Schema.optionalKey(FailureTypeId) })),
  beforeLoad: ({ context, location }) => {
    if (context.visitante === null) throw redirect({ to: '/entrar', search: volverAqui(location) })
  },
  loader: ({ params }) => opcionesSolucionFn({ data: { reporteId: params.reporteId } }),
  head: ({ loaderData }) => ({ meta: [{ title: `Proponer solución · ${loaderData?.reporte.juego ?? 'OpenGame Linux'}` }] }),
  component: ProponerSolucion,
})

function ProponerSolucion() {
  const { reporte, fallos, perfiles } = Route.useLoaderData()
  const { tipoFallo: preseleccion } = Route.useSearch()
  const [enviada, setEnviada] = useState(false)
  const r = useAccion(NewSolution, registrarSolucionFn, { alFallar: erroresDeRegla, alCompletar: () => setEnviada(true) })

  return (
    <main className="envoltura">
      <p className="rotulo">Proponer solución</p>
      <h1>{reporte.juego}</h1>
      <section className="tarjeta pila">
        <p className="fila">
          <Insignia etiqueta={resultado[reporte.resultado]} />
          <Insignia etiqueta={estadoRevision[reporte.estado_revision]} />
          <span className="dato">
            {reporte.lanzador} · {reporte.distribucion} · {reporte.capa} · versión {reporte.version_juego} · {momento(reporte.fecha_prueba)}
          </span>
        </p>
        <p>{reporte.observaciones}</p>
      </section>

      {enviada ? (
        <section className="tarjeta pila" aria-live="polite">
          <h2>Solución enviada</h2>
          <p>
            Queda <strong>pendiente de revisión</strong>. Para publicarla, un revisor necesita evidencia de que resuelve el fallo, no solo que el fallo existe.
          </p>
          <p>
            <Link to="/juegos/$juegoId" params={{ juegoId: reporte.juego_id }}>
              Volver a la ficha del juego
            </Link>
          </p>
        </section>
      ) : (
        <form className="tarjeta formulario formulario-ancho" {...r.formulario}>
          <ErrorCampo errores={r.errores} campo="formulario" />
          <input type="hidden" name="reporte_id" value={reporte.id} />
          <Campo errores={r.errores} nombre="tipo_fallo_id" etiqueta="Fallo que resuelve">
            <select {...campo(r.errores, 'tipo_fallo_id')} defaultValue={fallos.find((f) => f.tipo_fallo_id === preseleccion)?.tipo_fallo_id}>
              {fallos.map((f) => (
                <option key={f.tipo_fallo_id} value={f.tipo_fallo_id}>
                  {tipoFallo(f.codigo).texto}: {f.detalle}
                </option>
              ))}
            </select>
          </Campo>
          <Campo
            errores={r.errores}
            nombre="perfil_id"
            etiqueta="Perfil que recomiendas (opcional)"
            ayuda="Solo perfiles de la misma edición. Si recomiendas uno pendiente, la solución no se aprueba hasta que el perfil lo esté."
          >
            <select {...campo(r.errores, 'perfil_id')} defaultValue={nulo}>
              <option value={nulo}>Ninguno: describo otra acción</option>
              {perfiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.titulo} (r{p.revision}, {estadoRevision[p.estado_revision].texto.toLowerCase()})
                </option>
              ))}
            </select>
          </Campo>
          <Campo errores={r.errores} nombre="titulo" etiqueta="Título">
            <input {...campo(r.errores, 'titulo')} placeholder="Reinstalar el lanzador dentro del prefijo" />
          </Campo>
          <Campo errores={r.errores} nombre="instrucciones" etiqueta="Instrucciones" ayuda="Pasos concretos para resolver el fallo o aplicar la alternativa.">
            <textarea {...campo(r.errores, 'instrucciones')} rows={6} />
          </Campo>
          <button type="submit" disabled={r.enviando}>
            {r.enviando ? 'Enviando…' : 'Enviar solución'}
          </button>
        </form>
      )}
    </main>
  )
}
