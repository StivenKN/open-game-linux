// Ficha (wireframe 9.3). Loader -> server fn -> one Effect program; the page data type is inferred end
// to end from servidor/consultas/ficha.ts.
import { createFileRoute, Link } from '@tanstack/react-router'
import { JuegoId } from '../../dominio/ids.ts'
import { fichaJuegoFn } from '../../fns/catalogo.ts'
import { EstadoJuego } from '../../ui/compatibilidad/EstadoJuego.tsx'
import { MatrizEntornos } from '../../ui/compatibilidad/MatrizEntornos.tsx'
import { VeredictoParaMi } from '../../ui/compatibilidad/VeredictoParaMi.tsx'
import { contar, fecha } from '../../ui/formato.ts'
import { Chip, Insignia } from '../../ui/Insignia.tsx'
import { SelloEjemplo } from '../../ui/SelloEjemplo.tsx'
import { tipoFallo, veredictoRequisitos } from '../../ui/vocabulario.ts'
import { idDeRuta } from '../-ids.ts'

const juegoId = idDeRuta(JuegoId)

export const Route = createFileRoute('/juegos/$juegoId')({
  params: { parse: (p) => ({ juegoId: juegoId(p.juegoId) }), stringify: (p) => ({ juegoId: String(p.juegoId) }) },
  loader: ({ params }) => fichaJuegoFn({ data: params }),
  head: ({ loaderData }) => ({ meta: [{ title: loaderData ? `${loaderData.juego.titulo} · OpenGame Linux` : 'OpenGame Linux' }] }),
  component: Ficha,
})

function Ficha() {
  const { juego, ediciones, resumen, ejemplo, pendientes, perfiles, causas, diagnostico, personal } = Route.useLoaderData()
  const { visitante } = Route.useRouteContext()
  return (
    <main className="envoltura">
      <div className="rejilla-2">
        <div className="pila">
          <div className="migas">
            <Link to="/">Catálogo</Link> / {juego.titulo}
          </div>
          <h1 className="titulo-juego">{juego.titulo}</h1>
          <div className="fila-chips" aria-label="Ediciones">
            {ediciones.map((e) => (
              <span key={e.id} className="chip">
                {e.lanzador}
                {e.identificador_externo && <span className="tenue"> · {e.identificador_externo}</span>}
              </span>
            ))}
          </div>
          <p>{juego.descripcion}</p>
          <p className="pequeno tenue">
            El estado se calcula al consultar a partir de reportes aprobados. Un resultado favorable no garantiza que
            funcione en cualquier equipo.
          </p>
          <p>
            <Link to="/juegos/$juegoId/reportar" params={{ juegoId: String(juego.id) }} className="boton">
              Reportar un resultado
            </Link>
          </p>
        </div>
        <div className="tarjeta pila">
          {ejemplo && <SelloEjemplo />}
          <EstadoJuego resumen={resumen} pendientes={pendientes} />
          <hr />
          <VeredictoParaMi personal={personal} />
          {diagnostico && (
            <p className="pequeno tenue">
              Según tu diagnóstico más reciente: {diagnostico.equipo}, {fecha(diagnostico.capturado_en)}.
            </p>
          )}
        </div>
      </div>

      <h2 className="titulo-seccion">Entornos probados</h2>
      <MatrizEntornos entornos={resumen.entornos} miDistribucion={diagnostico?.distribucion_id ?? null} />

      <h2 className="titulo-seccion">Perfiles de configuración</h2>
      {perfiles.length === 0 ? (
        <p className="tarjeta tenue">Todavía no hay perfiles para este juego.</p>
      ) : (
        <ul className="lista-tarjetas">
          {perfiles.map((p) => (
            <li key={p.id} className="tarjeta pila">
              <div className="fila">
                <Link to="/perfiles/$perfilId" params={{ perfilId: p.id }} className="nombre-juego">
                  {p.titulo} r{p.revision}
                </Link>
                {p.estado_revision === 'pendiente' && <Chip tono="gris">en prueba</Chip>}
                {p.ejemplo && <SelloEjemplo />}
              </div>
              <div className="fila-chips">
                <span className="chip">{p.lanzador}</span>
                <span className="chip">{p.distribucion}</span>
                <span className="chip">{p.capa}</span>
                <span className="chip">{p.arquitectura}</span>
              </div>
              {p.estado_revision === 'pendiente' ? (
                <p className="pequeno tenue">Aún no está aprobado. Puedes probarlo: tu reporte aporta la evidencia que su aprobación necesita.</p>
              ) : (
                p.evaluacion && (
                  <div className="fila pequeno">
                    <span>Tu equipo:</span>
                    <Insignia etiqueta={veredictoRequisitos[p.evaluacion.veredicto]} forma="punteado" />
                  </div>
                )
              )}
            </li>
          ))}
        </ul>
      )}

      <h2 className="titulo-seccion">Causas observadas y soluciones</h2>
      {causas.length === 0 ? (
        <p className="tarjeta tenue">Ningún reporte aprobado registra un fallo.</p>
      ) : (
        <ul className="lista-tarjetas">
          {causas.map((c) => {
            const etiqueta = tipoFallo(c.codigo)
            return (
              <li key={c.codigo} className="tarjeta pila">
                <div className="fila">
                  <Chip tono={etiqueta.tono}>{etiqueta.texto}</Chip>
                  <span className="pequeno tenue">{contar(c.reportes, 'reporte aprobado', 'reportes aprobados')}</span>
                </div>
                {c.descripcion && <p className="pequeno">{c.descripcion}</p>}
                {c.soluciones.length === 0 ? (
                  <p className="pequeno tenue">Sin soluciones verificadas todavía.</p>
                ) : (
                  c.soluciones.map((s) => (
                    <div key={s.id} className="solucion pila">
                      <div className="fila">
                        <b>{s.titulo}</b>
                        {s.ejemplo && <SelloEjemplo />}
                      </div>
                      <p className="texto-largo pequeno">{s.instrucciones}</p>
                      <p className="pequeno tenue">
                        Aportada por {s.autor}
                        {s.perfil && <> · recomienda el perfil {s.perfil}</>}
                      </p>
                    </div>
                  ))
                )}
                {visitante !== null && c.responder !== null && (
                  <p className="pequeno">
                    <Link
                      to="/reportes/$reporteId/solucion"
                      params={{ reporteId: String(c.responder.reporte_id) }}
                      search={{ tipoFallo: c.responder.tipo_fallo_id }}
                    >
                      Proponer una solución
                    </Link>
                  </p>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </main>
  )
}
