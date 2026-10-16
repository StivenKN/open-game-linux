import { createFileRoute, Link, redirect } from '@tanstack/react-router'
import { ReporteId } from '../../domain/ids.ts'
import { informeProtonFn } from '../../fns/upstream.ts'
import { CajaCopiar } from '../../ui/compatibility/CopyBox.tsx'
import { SelloEjemplo } from '../../ui/DemoStamp.tsx'
import { motivoSinInforme } from '../../ui/vocabulary.ts'
import { idDeRuta } from '../-ids.ts'
import { volverAqui } from '../-return-to.ts'

const reporteId = idDeRuta(ReporteId)

export const Route = createFileRoute('/reportes/$reporteId/proton')({
  params: { parse: (p) => ({ reporteId: reporteId(p.reporteId) }), stringify: (p) => ({ reporteId: String(p.reporteId) }) },
  beforeLoad: ({ context, location }) => {
    if (context.visitante === null) throw redirect({ to: '/entrar', search: volverAqui(location) })
  },
  loader: ({ params }) => informeProtonFn({ data: { reporteId: params.reporteId } }),
  head: ({ loaderData }) => ({ meta: [{ title: `Informe para Valve · ${loaderData?.reporte.juego ?? 'OpenGame Linux'}` }] }),
  component: InformeParaValve,
})

function InformeParaValve() {
  const { reporte, informe: x } = Route.useLoaderData()
  const volver = (
    <Link to="/juegos/$juegoId" params={{ juegoId: reporte.juego_id }}>
      Volver a la ficha del juego
    </Link>
  )
  return (
    <main className="envoltura estrecha-lectura pila">
      <p className="rotulo">Informe para Valve</p>
      <h1>{reporte.juego}</h1>
      {x._tag === 'no_aplica' ? (
        <section className="tarjeta pila">
          <p>{motivoSinInforme[x.motivo]}</p>
          <p>{volver}</p>
        </section>
      ) : (
        <>
          <p className="tenue">
            Solo tú ves esta página: el informe lleva tu GPU, tu controlador y tu kernel. OpenGame no lo envía; lo abres tú en GitHub.
          </p>
          <p>
            Valve corrige Proton a partir de informes en su repositorio de GitHub. Este ya lleva tu equipo y lo que viste; solo falta el
            registro de Proton.
          </p>
          <ol className="pasos">
            <li className="tarjeta pila">
              <b>Activa el registro de Proton</b>
              <p className="texto-largo">
                En Steam, clic derecho sobre el juego &gt; Propiedades &gt; General. Pon esto en «Opciones de lanzamiento» y juega hasta que
                aparezca el fallo. Si ya tenías opciones, añade PROTON_LOG=1 al principio y deja %command% una sola vez.
              </p>
              <CajaCopiar etiqueta="Opciones de lanzamiento" texto={x.comando_registro} />
            </li>
            <li className="tarjeta pila">
              <b>Comprime el registro</b>
              <p className="texto-largo">Proton lo deja en tu carpeta personal. Comprimido pesa mucho menos y GitHub lo acepta como adjunto.</p>
              <CajaCopiar etiqueta="Comprimir el registro" texto={x.comando_comprimir} />
            </li>
            <li className="tarjeta pila">
              <b>Busca si ya hay un informe</b>
              <p className="texto-largo">
                Valve quiere un informe por juego. Si ya existe uno con el AppID {x.appid}, comenta allí con el texto de abajo y el registro en
                lugar de abrir otro.
              </p>
              <p>
                <a href={x.buscar} target="_blank" rel="noreferrer">
                  Buscar informes del AppID {x.appid}
                </a>
              </p>
            </li>
            <li className="tarjeta pila">
              <b>Abre el informe</b>
              <p className="texto-largo">
                Arrastra steam-{x.appid}.log.gz al informe y marca las casillas «I confirm» solo si son ciertas.
              </p>
              <p className="fila">
                {x.abrir._tag === 'enlace' ? (
                  <a className="boton" href={x.abrir.url} target="_blank" rel="noreferrer">
                    Abrir el informe en GitHub
                  </a>
                ) : (
                  <span className="fila pequeno tenue">
                    <SelloEjemplo /> Los datos de ejemplo no se envían a Valve.
                  </span>
                )}
              </p>
              <p className="pequeno nota" data-tono={x.cuerpo_en_enlace ? 'azul' : 'amarillo'}>
                {x.cuerpo_en_enlace
                  ? 'Si el formulario no trae el informe, reemplaza su texto con este.'
                  : 'El informe es demasiado largo para el enlace: pega este texto en el formulario.'}
              </p>
              <CajaCopiar etiqueta={`Informe: ${x.titulo}`} texto={x.cuerpo} />
            </li>
          </ol>
          <p>{volver}</p>
        </>
      )}
    </main>
  )
}
