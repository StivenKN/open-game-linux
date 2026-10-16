import { HeadContent, Link, Outlet, Scripts, createRootRoute, useLocation, useRouter } from '@tanstack/react-router'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import bigShoulders from '@fontsource-variable/big-shoulders-display/files/big-shoulders-display-latin-wght-normal.woff2?url'
import onest from '@fontsource-variable/onest/files/onest-latin-wght-normal.woff2?url'
import unbounded from '@fontsource-variable/unbounded/files/unbounded-latin-wght-normal.woff2?url'
import icon from '../../assets/icon.svg?url'
import { visitorFn } from '../fns/session.ts'
import appCss from '../styles.css?url'
import { authClient } from './-auth-client.ts'

export const Route = createRootRoute({
  beforeLoad: async () => ({ visitor: await visitorFn() }),
  head: () => ({
    meta: [{ charSet: 'utf-8' }, { name: 'viewport', content: 'width=device-width, initial-scale=1' }, { title: 'OpenGame Linux' }],
    links: [
      { rel: 'stylesheet', href: appCss },
      // The stylesheet only discovers its fonts after it parses; preloading the Latin files lets SSR text
      // paint in its real face instead of swapping.
      ...[onest, unbounded, bigShoulders].map((href) => ({ rel: 'preload', as: 'font', type: 'font/woff2', crossOrigin: 'anonymous' as const, href })),
      { rel: 'icon', type: 'image/svg+xml', href: icon },
    ],
  }),
  shellComponent: RootDocument,
  component: RootLayout,
  notFoundComponent: NotFoundPage,
  errorComponent: ErrorPage,
})

function RootDocument({ children }: { children: ReactNode }) {
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

function RootLayout() {
  return (
    <>
      <SiteHeader />
      <Outlet />
    </>
  )
}

function SiteHeader() {
  const { visitor } = Route.useRouteContext()
  const nav = useRef<HTMLElement>(null)
  const { pathname } = useLocation()
  // On narrow screens the nav scrolls sideways; bring the current page's link into view. scrollIntoView
  // would also scroll the page vertically.
  useEffect(() => {
    const n = nav.current
    const current = n?.querySelector<HTMLElement>('[data-status="active"]')
    if (n && current) n.scrollLeft = Math.max(0, current.offsetLeft + current.offsetWidth - n.offsetLeft - n.clientWidth + 16)
  }, [pathname])
  return (
    <header className="header">
      <Link to="/" className="brand">
        <Brand />
        OpenGame Linux
      </Link>
      <nav ref={nav} aria-label="Principal" className="nav">
        <Link to="/" activeOptions={{ exact: true }}>
          Inicio
        </Link>
        <Link to="/diagnostico">Diagnóstico</Link>
        <Link to="/guias">Guías</Link>
        {visitor !== null && visitor.role !== 'usuario' && (
          <>
            <Link to="/revision">Revisión</Link>
            <Link to="/catalogo/nuevo">Nuevo juego</Link>
          </>
        )}
      </nav>
      <div className="account">
        {visitor === null ? (
          <>
            <Link to="/entrar" className="button-secondary">
              Entrar
            </Link>
            <Link to="/registro" className="button">
              Crear cuenta
            </Link>
          </>
        ) : (
          <>
            <span>
              Hola, <strong>{visitor.alias}</strong>
            </span>
            <SignOutButton />
          </>
        )}
      </div>
    </header>
  )
}

function Brand() {
  return (
    <svg width="34" height="34" viewBox="0 0 34 34" aria-hidden="true">
      <rect x="2" y="6" width="16" height="22" rx="4" fill="#5b4568" transform="rotate(-10 10 17)" />
      <rect x="9" y="4" width="16" height="22" rx="4" fill="#8a6d99" />
      <rect x="16" y="6" width="16" height="22" rx="4" fill="#fbf1e7" transform="rotate(10 24 17)" />
      <rect x="16" y="22" width="16" height="6" fill="#43d98a" transform="rotate(10 24 17)" />
    </svg>
  )
}

function SignOutButton() {
  const router = useRouter()
  const [signingOut, setSigningOut] = useState(false)
  const signOut = async () => {
    setSigningOut(true)
    await authClient.signOut()
    await router.invalidate()
    setSigningOut(false)
  }
  return (
    <button type="button" className="button-secondary" onClick={() => void signOut()} disabled={signingOut}>
      Salir
    </button>
  )
}

function NotFoundPage() {
  return (
    <main className="wrapper">
      <h1>No encontramos esa página</h1>
      <p className="muted">Puede que el enlace esté mal escrito o que el contenido ya no exista.</p>
      <Link to="/">Volver al inicio</Link>
    </main>
  )
}

function ErrorPage() {
  return (
    <main className="wrapper">
      <h1>Algo falló de nuestro lado</h1>
      <p className="muted">Intenta de nuevo en unos segundos.</p>
    </main>
  )
}
