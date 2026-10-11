// Ficha (wireframe 9.3). Loader -> server fn -> one Effect program. The page data type is inferred
// end to end from servidor/consultas/ficha.ts; nothing here declares it.
import { Link, createFileRoute } from '@tanstack/react-router'
import { fichaJuegoFn } from '../../fns/catalogo.ts'
import { EstadoJuego } from '../../ui/compatibilidad/EstadoJuego.tsx'
import { estadoCompatibilidad, veredictoRequisitos } from '../../ui/vocabulario.ts'

export const Route = createFileRoute('/juegos/$juegoId')({
  loader: ({ params }) => fichaJuegoFn({ data: { juegoId: params.juegoId } }),
  head: ({ loaderData }) => ({ meta: [{ title: loaderData ? `${loaderData.juego.titulo} · OpenGame Linux` : 'OpenGame Linux' }] }),
  component: Ficha,
})

function Ficha() {
  const { juego, resumen, personal, perfiles, pendientes } = Route.useLoaderData()
  return (
    <main>
      <h1>{juego.titulo}</h1>
      <EstadoJuego resumen={resumen} pendientes={pendientes.length} />

      {personal?.en_mi_distribucion && (
        <p>
          En tu distribución ({personal.diagnostico.distribucion}): {estadoCompatibilidad[personal.en_mi_distribucion.estado].texto}
        </p>
      )}

      <table>
        <tbody>
          {resumen.entornos.map((e) => (
            <tr key={e.clave} data-tu-distro={e.distribucion_id === personal?.diagnostico.distribucion_id}>
              <td>{e.distribucion}</td>
              <td>{e.capa}</td>
              <td>{e.lanzador} · {e.version_juego}</td>
              <td>{e.perfil ?? 'sin perfil'}</td>
              <td>{estadoCompatibilidad[e.estado].texto}</td>
              <td>{e.fps.map((f) => `${f.promedio} FPS ${f.resolucion} · ${f.calidad}`).join(' / ') || 'no medido'}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <ul>
        {perfiles.map((p) => (
          <li key={p.id}>
            <Link to="/perfiles/$perfilId" params={{ perfilId: String(p.id) }}>{p.titulo} r{p.revision}</Link>
            {p.estado_revision === 'pendiente' && ' (en prueba)'}
            {p.evaluacion && <span data-borde="punteado"> {veredictoRequisitos[p.evaluacion.veredicto].texto}</span>}
          </li>
        ))}
      </ul>

      <Link to="/juegos/$juegoId/reportar" params={{ juegoId: String(juego.id) }} search={{}}>Reportar un resultado</Link>
    </main>
  )
}
