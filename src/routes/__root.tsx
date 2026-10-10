// Root: resolves the visitor once per navigation for the header and route guards (UX only; programs re-check).
import { HeadContent, Link, Outlet, Scripts, createRootRoute, useRouter } from '@tanstack/react-router'
import { type ReactNode, useState } from 'react'
import icono from '../../assets/icon.svg?url'
import { visitanteFn } from '../fns/sesion.ts'
import appCss from '../styles.css?url'
import { authCliente } from './-auth-cliente.ts'

export const Route = createRootRoute({
  beforeLoad: async () => ({ visitante: await visitanteFn() }),
  head: () => ({
    meta: [{ charSet: 'utf-8' }, { name: 'viewport', content: 'width=device-width, initial-scale=1' }, { title: 'OpenGame Linux' }],
    links: [
      { rel: 'stylesheet', href: appCss },
      { rel: 'icon', type: 'image/svg+xml', href: icono },
    ],
  }),
  shellComponent: Documento,
  component: Marco,
  notFoundComponent: NoEncontrada,
  errorComponent: ErrorGeneral,
})

function Documento({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  )
}

function Marco() {
  return (
    <>
      <Cabecera />
      <Outlet />
    </>
  )
}

function Cabecera() {
  const { visitante } = Route.useRouteContext()
  return (
    <header className="barra">
      <div className="envoltura fila cabecera">
        <Link to="/" className="marca">
          OpenGame Linux
        </Link>
        <nav aria-label="Principal" className="fila">
          <Link to="/" activeOptions={{ exact: true }}>
            Inicio
          </Link>
          <Link to="/diagnostico">Diagnóstico</Link>
          <Link to="/guias">Guías</Link>
          {visitante !== null && visitante.rol !== 'usuario' && <Link to="/revision">Revisión</Link>}
        </nav>
        <div className="fila cuenta">
          {visitante === null ? (
            <>
              <Link to="/entrar">Entrar</Link>
              <Link to="/registro" className="boton">
                Crear cuenta
              </Link>
            </>
          ) : (
            <>
              <span>
                Hola, <strong>{visitante.alias}</strong>
              </span>
              <Salir />
            </>
          )}
        </div>
      </div>
    </header>
  )
}

function Salir() {
  const router = useRouter()
  const [saliendo, setSaliendo] = useState(false)
  const salir = async () => {
    setSaliendo(true)
    await authCliente.signOut()
    await router.invalidate()
    setSaliendo(false)
  }
  return (
    <button type="button" className="boton-secundario" onClick={() => void salir()} disabled={saliendo}>
      Salir
    </button>
  )
}

function NoEncontrada() {
  return (
    <main className="envoltura">
      <h1>No encontramos esa página</h1>
      <p className="tenue">Puede que el enlace esté mal escrito o que el contenido ya no exista.</p>
      <Link to="/">Volver al inicio</Link>
    </main>
  )
}

function ErrorGeneral() {
  return (
    <main className="envoltura">
      <h1>Algo falló de nuestro lado</h1>
      <p className="tenue">Intenta de nuevo en unos segundos.</p>
    </main>
  )
}
