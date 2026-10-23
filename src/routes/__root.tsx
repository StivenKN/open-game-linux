import { HeadContent, Link, Outlet, Scripts, createRootRoute, useLocation, useRouter } from '@tanstack/react-router'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import bigShoulders from '@fontsource-variable/big-shoulders-display/files/big-shoulders-display-latin-wght-normal.woff2?url'
import onest from '@fontsource-variable/onest/files/onest-latin-wght-normal.woff2?url'
import unbounded from '@fontsource-variable/unbounded/files/unbounded-latin-wght-normal.woff2?url'
import icon from '../../assets/icon.svg?url'
import { sessionFn } from '../fns/session.ts'
import type { Role } from '../domain/review.ts'
import appCss from '../styles.css?url'
import { Brand } from '../ui/Brand.tsx'
import { langCookie, localizedPath, withoutLang } from '../ui/i18n/lang.ts'
import { messages, useLang, useT } from '../ui/i18n/messages.ts'
import { authClient } from './-auth-client.ts'

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
      // An index route matches with a trailing slash, which the router redirects away from. The preview's
      // words are in the language's own head (routes/$lang/route.tsx).
      { property: 'og:url', content: `${match.context.origin}${(matches.at(-1)?.pathname ?? '/').replace(/(.)\/$/, '$1')}` },
      { property: 'og:image:width', content: '1200' },
      { property: 'og:image:height', content: '630' },
      { name: 'twitter:card', content: 'summary_large_image' },
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
    <html lang={useLang()}>
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

/**
 * One line at 1280px for every role in both languages: the pages everyone uses in the nav, and what belongs
 * to the account (its contributions, followed games, reviewer and admin tools) in the account menu.
 */
function SiteHeader() {
  const { visitor, followed_news: news } = Route.useRouteContext()
  const t = useT()
  const lang = useLang()
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
      <Link to="/$lang" params={{ lang }} className="brand">
        <Brand />
        OpenGame Linux
      </Link>
      <nav ref={nav} aria-label={t.header.nav} className="nav">
        <Link to="/$lang" params={{ lang }} activeOptions={{ exact: true }}>
          {t.header.catalog}
        </Link>
        <Link to="/$lang/diagnostico" params={{ lang }}>
          {t.header.diagnosis}
        </Link>
        <Link to="/$lang/guias" params={{ lang }}>
          {t.header.guides}
        </Link>
        <Link to="/$lang/pedidos" params={{ lang }}>
          {t.header.requests}
        </Link>
        {visitor !== null && visitor.role !== 'usuario' && (
          <Link to="/$lang/revision" params={{ lang }}>
            {t.header.review}
          </Link>
        )}
      </nav>
      <div className="account">
        <LanguageSwitch />
        {visitor === null ? (
          <>
            <Link to="/$lang/entrar" params={{ lang }} className="button-secondary">
              {t.header.signIn}
            </Link>
            <Link to="/$lang/registro" params={{ lang }} className="button">
              {t.header.signUp}
            </Link>
          </>
        ) : (
          <AccountMenu alias={visitor.alias} role={visitor.role} news={news} />
        )}
      </div>
    </header>
  )
}

/** The same page and query in the other language. A plain link, so the whole page renders again in it. */
function LanguageSwitch() {
  const other = useLang() === 'es' ? 'en' : 'es'
  const { pathname, searchStr } = useLocation()
  return (
    <a
      href={localizedPath(other, withoutLang(pathname)) + searchStr}
      hrefLang={other}
      lang={other}
      title={messages[other].header.switchLanguage}
      className="language-switch"
      // The choice outlives this page: an unprefixed link (an old bookmark, an old copy of the detector) opens in it too.
      onClick={() => {
        document.cookie = `${langCookie}=${other}; path=/; max-age=31536000; samesite=lax`
      }}
    >
      {messages[other].languageName}
    </a>
  )
}

/**
 * A disclosure, so it opens with the keyboard and without JavaScript. Escape, a click outside and moving to
 * another page close it.
 */
function AccountMenu({ alias, role, news }: { alias: string; role: Role; news: number }) {
  const t = useT()
  const lang = useLang()
  const menu = useRef<HTMLDetailsElement>(null)
  const { pathname } = useLocation()
  useEffect(() => {
    if (menu.current) menu.current.open = false
  }, [pathname])
  useEffect(() => {
    const closeOutside = (e: PointerEvent) => {
      const m = menu.current
      if (m?.open && e.target instanceof Node && !m.contains(e.target)) m.open = false
    }
    document.addEventListener('pointerdown', closeOutside)
    return () => document.removeEventListener('pointerdown', closeOutside)
  }, [])
  const newsCount = news > 0 && (
    <>
      <span className="nav-count" aria-hidden="true">
        {news}
      </span>
      <span className="sr-only"> ({t.header.news(news)})</span>
    </>
  )
  return (
    <details
      ref={menu}
      className="account-menu"
      onKeyDown={(e) => {
        if (e.key !== 'Escape' || !menu.current?.open) return
        menu.current.open = false
        menu.current.querySelector('summary')?.focus()
      }}
    >
      <summary>
        <span className="sr-only">{t.header.account}: </span>
        <span className="account-alias">{alias}</span>
        {newsCount}
      </summary>
      <nav aria-label={t.header.account} className="account-links">
        <Link to="/$lang/mis-aportes" params={{ lang }}>
          {t.header.myContributions}
        </Link>
        <Link to="/$lang/seguidos" params={{ lang }}>
          {t.header.followed}
          {newsCount}
        </Link>
        {role !== 'usuario' && (
          <Link to="/$lang/catalogo/nuevo" params={{ lang }}>
            {t.header.newGame}
          </Link>
        )}
        {role === 'administrador' && (
          <Link to="/$lang/admin/usuarios" params={{ lang }}>
            {t.header.users}
          </Link>
        )}
        <SignOutButton />
      </nav>
    </details>
  )
}

function SignOutButton() {
  const router = useRouter()
  const t = useT()
  const [signingOut, setSigningOut] = useState(false)
  const signOut = async () => {
    setSigningOut(true)
    await authClient.signOut()
    await router.invalidate()
    setSigningOut(false)
  }
  return (
    <button type="button" className="button-secondary" onClick={() => void signOut()} disabled={signingOut}>
      {t.header.signOut}
    </button>
  )
}

function NotFoundPage() {
  const t = useT()
  return (
    <main className="wrapper">
      <h1>{t.notFound.title}</h1>
      <p className="muted">{t.notFound.body}</p>
      <Link to="/$lang" params={{ lang: useLang() }}>
        {t.notFound.home}
      </Link>
    </main>
  )
}

function ErrorPage() {
  const t = useT()
  return (
    <main className="wrapper">
      <h1>{t.error.title}</h1>
      <p className="muted">{t.error.body}</p>
    </main>
  )
}
