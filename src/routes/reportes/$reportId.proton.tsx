import { createFileRoute, Link, redirect } from '@tanstack/react-router'
import { ReportId } from '../../domain/ids.ts'
import { protonReportFn } from '../../fns/upstream.ts'
import { CajaCopiar } from '../../ui/compatibility/CopyBox.tsx'
import { SelloEjemplo } from '../../ui/DemoStamp.tsx'
import { motivoSinInforme } from '../../ui/vocabulary.ts'
import { idDeRuta } from '../-ids.ts'
import { volverAqui } from '../-return-to.ts'

const reportId = idDeRuta(ReportId)

export const Route = createFileRoute('/reportes/$reportId/proton')({
  params: { parse: (p) => ({ reportId: reportId(p.reportId) }), stringify: (p) => ({ reportId: String(p.reportId) }) },
  beforeLoad: ({ context, location }) => {
    if (context.visitante === null) throw redirect({ to: '/entrar', search: volverAqui(location) })
  },
  loader: ({ params }) => protonReportFn({ data: { reportId: params.reportId } }),
  head: ({ loaderData }) => ({ meta: [{ title: `Informe para Valve · ${loaderData?.report.juego ?? 'OpenGame Linux'}` }] }),
  component: InformeParaValve,
})

function InformeParaValve() {
  const { report: reporte, protonReport: x } = Route.useLoaderData()
  const volver = (
    <Link to="/juegos/$gameId" params={{ gameId: reporte.juego_id }}>
      Volver a la ficha del juego
    </Link>
  )
  return (
    <main className="envoltura estrecha-lectura pila">
      <p className="rotulo">Informe para Valve</p>
      <h1>{reporte.juego}</h1>
      {x._tag === 'no_aplica' ? (
        <section className="tarjeta pila">
          <p>{motivoSinInforme[x.reason]}</p>
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
              <CajaCopiar etiqueta="Opciones de lanzamiento" texto={x.log_command} />
            </li>
            <li className="tarjeta pila">
              <b>Comprime el registro</b>
              <p className="texto-largo">Proton lo deja en tu carpeta personal. Comprimido pesa mucho menos y GitHub lo acepta como adjunto.</p>
              <CajaCopiar etiqueta="Comprimir el registro" texto={x.compress_command} />
            </li>
            <li className="tarjeta pila">
              <b>Busca si ya hay un informe</b>
              <p className="texto-largo">
                Valve quiere un informe por juego. Si ya existe uno con el AppID {x.appid}, comenta allí con el texto de abajo y el registro en
                lugar de abrir otro.
              </p>
              <p>
                <a href={x.search} target="_blank" rel="noreferrer">
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
                {x.open._tag === 'enlace' ? (
                  <a className="boton" href={x.open.url} target="_blank" rel="noreferrer">
                    Abrir el informe en GitHub
                  </a>
                ) : (
                  <span className="fila pequeno tenue">
                    <SelloEjemplo /> Los datos de ejemplo no se envían a Valve.
                  </span>
                )}
              </p>
              <p className="pequeno nota" data-tono={x.body_in_link ? 'azul' : 'amarillo'}>
                {x.body_in_link
                  ? 'Si el formulario no trae el informe, reemplaza su texto con este.'
                  : 'El informe es demasiado largo para el enlace: pega este texto en el formulario.'}
              </p>
              <CajaCopiar etiqueta={`Informe: ${x.title}`} texto={x.body} />
            </li>
          </ol>
          <p>{volver}</p>
        </>
      )}
    </main>
  )
}
