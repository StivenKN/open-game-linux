// Root: resolves the visitor once per navigation for nav and route guards (UX only; programs re-check).
import { HeadContent, Link, Outlet, Scripts, createRootRoute } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { visitanteFn } from '../fns/sesion.ts'

export const Route = createRootRoute({
  beforeLoad: async () => ({ visitante: await visitanteFn() }),
  head: () => ({ meta: [{ charSet: 'utf-8' }, { name: 'viewport', content: 'width=device-width, initial-scale=1' }, { title: 'OpenGame Linux' }] }),
  shellComponent: Documento,
  component: Marco,
  notFoundComponent: () => <p>No encontramos esa página.</p>,
  errorComponent: () => <p>Algo falló de nuestro lado. Intenta de nuevo.</p>,
})

function Marco() {
  const { visitante } = Route.useRouteContext()
  return (
    <>
      <nav>
        <Link to="/">Catálogo</Link> <Link to="/diagnostico">Diagnóstico</Link> <Link to="/guias">Guías</Link>
        {visitante && visitante.rol !== 'usuario' && <Link to="/revision" search={{ tipo: 'reporte' }}>Revisión</Link>}
        {visitante ? <span>{visitante.alias}</span> : <Link to="/entrar">Entrar</Link>}
      </nav>
      <Outlet />
    </>
  )
}

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
