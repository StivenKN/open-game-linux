import { HeadContent, Link, Outlet, Scripts, createRootRoute, useLocation, useRouter } from '@tanstack/react-router'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import bigShoulders from '@fontsource-variable/big-shoulders-display/files/big-shoulders-display-latin-wght-normal.woff2?url'
import onest from '@fontsource-variable/onest/files/onest-latin-wght-normal.woff2?url'
import unbounded from '@fontsource-variable/unbounded/files/unbounded-latin-wght-normal.woff2?url'
import icon from '../../assets/icon.svg?url'
import { sessionFn } from '../fns/session.ts'
import appCss from '../styles.css?url'
import { Brand } from '../ui/Brand.tsx'
import { count } from '../ui/format.ts'
import { authClient } from './-auth-client.ts'
import { previewMeta } from './-meta.ts'

export const Route = createRootRoute({
  // Runs on every navigation, so the header's count of followed games with news stays current.
  beforeLoad: () => sessionFn(),
  head: ({ match, matches }) => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'OpenGame Linux' },
      { property: 'og:type', content: 'website' },
      { property: 'og:site_name', content: 'OpenGame Linux' },
      // An index route matches with a trailing slash, which the router redirects away from.
      { property: 'og:url', content: `${match.context.origin}${(matches.at(-1)?.pathname ?? '/').replace(/(.)\/$/, '$1')}` },
      { property: 'og:image:width', content: '1200' },
      { property: 'og:image:height', content: '630' },
      { name: 'twitter:card', content: 'summary_large_image' },
      ...previewMeta(match.context.origin, {
        title: 'OpenGame Linux',
        description: 'Mira si un juego de Windows funciona en Linux, según los reportes de jugadores que aprobó un revisor.',
        image: '/og.png',
        imageAlt: 'OpenGame Linux: lleva tu biblioteca de Windows a Linux.',
      }),
    ],
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
  const { visitor, followed_news: news } = Route.useRouteContext()
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
        <Link to="/pedidos">Pedidos</Link>
        {visitor !== null && (
          <>
            <Link to="/mis-aportes">Mis aportes</Link>
            <Link to="/seguidos">
              Seguidos
              {news > 0 && (
                <>
                  <span className="nav-count" aria-hidden="true">
                    {news}
                  </span>
                  <span className="sr-only"> ({count(news, 'juego con novedades', 'juegos con novedades')})</span>
                </>
              )}
            </Link>
          </>
        )}
        {visitor !== null && visitor.role !== 'usuario' && (
          <>
            <Link to="/revision">Revisión</Link>
            <Link to="/catalogo/nuevo">Nuevo juego</Link>
          </>
        )}
        {visitor?.role === 'administrador' && <Link to="/admin/usuarios">Usuarios</Link>}
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
