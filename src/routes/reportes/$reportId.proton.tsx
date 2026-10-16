import { createFileRoute, Link, redirect } from '@tanstack/react-router'
import { ReportId } from '../../domain/ids.ts'
import { protonReportFn } from '../../fns/upstream.ts'
import { CopyBox } from '../../ui/compatibility/CopyBox.tsx'
import { DemoStamp } from '../../ui/DemoStamp.tsx'
import { noReportReason } from '../../ui/vocabulary.ts'
import { routeIdParser } from '../-ids.ts'
import { returnHere } from '../-return-to.ts'

const reportId = routeIdParser(ReportId)

export const Route = createFileRoute('/reportes/$reportId/proton')({
  params: { parse: (p) => ({ reportId: reportId(p.reportId) }), stringify: (p) => ({ reportId: String(p.reportId) }) },
  beforeLoad: ({ context, location }) => {
    if (context.visitor === null) throw redirect({ to: '/entrar', search: returnHere(location) })
  },
  loader: ({ params }) => protonReportFn({ data: { reportId: params.reportId } }),
  head: ({ loaderData }) => ({ meta: [{ title: `Informe para Valve · ${loaderData?.report.juego ?? 'OpenGame Linux'}` }] }),
  component: ValveReportPage,
})

function ValveReportPage() {
  const { report, protonReport: x } = Route.useLoaderData()
  const backLink = (
    <Link to="/juegos/$gameId" params={{ gameId: report.juego_id }}>
      Volver a la ficha del juego
    </Link>
  )
  return (
    <main className="envoltura estrecha-lectura pila">
      <p className="rotulo">Informe para Valve</p>
      <h1>{report.juego}</h1>
      {x._tag === 'no_aplica' ? (
        <section className="tarjeta pila">
          <p>{noReportReason[x.reason]}</p>
          <p>{backLink}</p>
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
              <CopyBox label="Opciones de lanzamiento" text={x.log_command} />
            </li>
            <li className="tarjeta pila">
              <b>Comprime el registro</b>
              <p className="texto-largo">Proton lo deja en tu carpeta personal. Comprimido pesa mucho menos y GitHub lo acepta como adjunto.</p>
              <CopyBox label="Comprimir el registro" text={x.compress_command} />
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
                    <DemoStamp /> Los datos de ejemplo no se envían a Valve.
                  </span>
                )}
              </p>
              <p className="pequeno nota" data-tono={x.body_in_link ? 'azul' : 'amarillo'}>
                {x.body_in_link
                  ? 'Si el formulario no trae el informe, reemplaza su texto con este.'
                  : 'El informe es demasiado largo para el enlace: pega este texto en el formulario.'}
              </p>
              <CopyBox label={`Informe: ${x.title}`} text={x.body} />
            </li>
          </ol>
          <p>{backLink}</p>
        </>
      )}
    </main>
  )
}
