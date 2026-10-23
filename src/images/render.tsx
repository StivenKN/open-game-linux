// Images of a game's computed state for other sites: the embeddable status badge (SVG) and the social
// preview (1200×630 PNG). satori lays out the JSX below with the app's own fonts and draws text as paths,
// so the badge looks the same wherever it is embedded; resvg rasterizes the preview. Only the server
// route handlers import this module: resvg is native and the fonts are read from disk.
import { readdir, readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { Resvg } from '@resvg/resvg-js'
import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import satori, { type Font, type FontWeight } from 'satori'
import type { CompatibilityStatus } from '../domain/compatibility.ts'
import { Brand } from '../ui/Brand.tsx'
import { Artwork } from '../ui/Cover.tsx'
import { count } from '../ui/format.ts'
import { compatibilityStatus, type Tone } from '../ui/vocabulary.ts'

/** What both images show of a game, as `server/queries/share.ts` reads it. */
export type GameCard = {
  readonly title: string
  readonly status: CompatibilityStatus
  readonly reports: number
  readonly no_recent_confirmation: boolean
  /** The state rests on a demo account's report, which the app stamps "Datos de ejemplo". */
  readonly demo: boolean
}

/** The colors of `styles.css` `:root` that the images use; `render.test.ts` keeps the two in sync. */
export const palette = {
  background: '#1c1422',
  'card-2': '#33263c',
  text: '#fbf1e7',
  muted: '#bba9c2',
  ink: '#1a1220',
  green: '#43d98a',
  yellow: '#ffc53d',
  red: '#ff6b6b',
  gray: '#8f8299',
  purple: '#c49cff',
  blue: '#7cc4ff',
} as const

const toneColor = {
  verde: palette.green,
  amarillo: palette.yellow,
  rojo: palette.red,
  gris: palette.gray,
  morado: palette.purple,
  azul: palette.blue,
} as const satisfies Record<Tone, string>

// A filled status, as `[data-shape='relleno']` paints it: the tone with ink text, and gray stripes for "Sin evidencia".
const filled = (status: CompatibilityStatus) =>
  status === 'sin_evidencia'
    ? { backgroundImage: 'repeating-linear-gradient(-45deg, #3c3245 0px, #3c3245 8px, #342a3d 8px, #342a3d 16px)', color: '#e4d8ea' }
    : { backgroundColor: toneColor[compatibilityStatus[status].tone], color: palette.ink }

const require = createRequire(import.meta.url)

// The static @fontsource packages: satori reads WOFF but not the WOFF2 the page's variable fonts ship as.
const faces = [
  ['Onest', 'onest', 500],
  ['Onest', 'onest', 700],
  ['Unbounded', 'unbounded', 800],
  ['Big Shoulders Display', 'big-shoulders-display', 900],
] as const satisfies ReadonlyArray<readonly [string, string, FontWeight]>

// Every subset a package ships (Latin, Cyrillic, Vietnamese…). satori draws a face with one font per name and
// takes a character that font lacks from a font of another name, so each subset but Latin loads under its own
// name. No face here covers Greek, CJK or emoji, which draw as boxes.
const loadFonts = async () => {
  const sets = await Promise.all(
    faces.map(async ([name, file, weight]) => {
      const dir = join(dirname(require.resolve(`@fontsource/${file}/package.json`)), 'files')
      const subsets = (await readdir(dir)).filter((f) => f.endsWith(`-${weight}-normal.woff`))
      return Promise.all(
        subsets.map(
          async (f): Promise<Font> => ({
            name: f === `${file}-latin-${weight}-normal.woff` ? name : `${name} ${f}`,
            data: await readFile(join(dir, f)),
            weight,
            style: 'normal',
          }),
        ),
      )
    }),
  )
  return sets.flat()
}

// Read once per process. satori also caches its parse of each font by this array's identity.
let fonts: ReturnType<typeof loadFonts> | undefined

const draw = async (element: ReactNode, size: { width: number; height: number } | { height: number }) =>
  satori(element, { ...size, fonts: await (fonts ??= loadFonts()) })

/** The seeded cover art as an SVG file, for satori to place (it cannot run the hook inside `Artwork`). */
const artworkImage = (title: string, width: number, height: number) => {
  // A standalone SVG needs the namespace an inline one can leave out, and satori needs its size.
  const svg = renderToStaticMarkup(
    <svg xmlns="http://www.w3.org/2000/svg" width={width} height={height}>
      <Artwork title={title} width={width} height={height} />
    </svg>,
  )
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
}

const segment = { display: 'flex', alignItems: 'center', padding: '0 8px' } as const

/** "OpenGame Linux | Funciona", shields-style, in the state's own color, then "Datos de ejemplo" when it applies. */
export const badgeSvg = async ({ status, demo }: Pick<GameCard, 'status' | 'demo'>) => {
  const label = compatibilityStatus[status].text
  const svg = await draw(
    <div style={{ display: 'flex', height: 22, borderRadius: 6, overflow: 'hidden', fontFamily: 'Onest', fontSize: 12.5, fontWeight: 700 }}>
      <div style={{ ...segment, backgroundColor: palette['card-2'], color: palette.text }}>OpenGame Linux</div>
      <div style={{ ...segment, ...filled(status) }}>{label}</div>
      {demo && <div style={{ ...segment, backgroundColor: palette.background, color: palette.text, fontWeight: 500 }}>Datos de ejemplo</div>}
    </div>,
    { height: 22 },
  )
  // satori draws the text as paths, so a <title> names the badge for screen readers and tooltips.
  return svg.replace('>', `><title>OpenGame Linux: ${label}${demo ? ' (datos de ejemplo)' : ''}</title>`)
}

// satori already drew every glyph, so resvg needs no fonts. Copied out of resvg's Buffer into a plain
// Uint8Array, which a Response body accepts.
const png = (svg: string) => new Uint8Array(new Resvg(svg, { font: { loadSystemFonts: false } }).render().asPng())

const width = 1200
const height = 630

/**
 * The 1200×630 canvas of both previews: the masthead on top, with the "Datos de ejemplo" stamp (`.stamp`) when
 * `demo`, and the content at the bottom, over `background`.
 */
function Frame({ background, demo = false, children }: { background: string; demo?: boolean; children: ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        width,
        height,
        boxSizing: 'border-box',
        padding: '52px 64px 60px',
        backgroundColor: palette.background,
        backgroundImage: background,
        color: palette.text,
        fontFamily: 'Onest',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18, fontFamily: 'Unbounded', fontWeight: 800, fontSize: 30 }}>
          <Brand size={56} />
          OpenGame Linux
        </div>
        {demo && (
          <div style={{ display: 'flex', padding: '6px 20px', borderRadius: 999, border: '2px solid #fff6', backgroundColor: '#0008', fontSize: 22, fontWeight: 700 }}>
            Datos de ejemplo
          </div>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>{children}</div>
    </div>
  )
}

/** A game's preview: its title over its cover art, as on its page, then the state and how many approved reports it rests on. */
export const gamePreviewPng = async (game: GameCard) => {
  const label = compatibilityStatus[game.status]
  const titleSize = game.title.length > 30 ? 92 : game.title.length > 16 ? 112 : 136
  // The game page banner's shade (`.game-page-banner::after`), so the text reads over any cover.
  const shade = 'linear-gradient(90deg, #1c1422e6 0%, #1c142280 45%, transparent 75%), linear-gradient(0deg, #1c1422 0%, transparent 45%)'
  const svg = await draw(
    <Frame background={`${shade}, url(${artworkImage(game.title, width, height)})`} demo={game.demo}>
      <div
        style={{
          display: 'block',
          lineClamp: 2,
          maxWidth: 1000,
          fontFamily: 'Big Shoulders Display',
          fontWeight: 900,
          fontSize: titleSize,
          lineHeight: 0.9,
          textTransform: 'uppercase',
        }}
      >
        {game.title}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
        <div style={{ display: 'flex', padding: '10px 26px', borderRadius: 999, fontFamily: 'Unbounded', fontWeight: 800, fontSize: 34, ...filled(game.status) }}>
          {label.text}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', fontSize: 26, fontWeight: 500, color: palette.muted }}>
          <span>{game.reports === 0 ? 'Todavía no hay reportes aprobados' : `Según ${count(game.reports, 'reporte aprobado', 'reportes aprobados')}`}</span>
          {game.no_recent_confirmation && <span style={{ color: palette.yellow }}>Sin confirmación en el último año</span>}
        </div>
      </div>
    </Frame>,
    { width, height },
  )
  return png(svg)
}

/** The preview of every page that is not a game's. */
export const sitePreviewPng = async () => {
  const svg = await draw(
    <Frame background="radial-gradient(circle at 85% 0%, #3a2440 0%, transparent 60%)">
      <div style={{ display: 'flex', maxWidth: 900, fontFamily: 'Unbounded', fontWeight: 800, fontSize: 68, lineHeight: 1.04, letterSpacing: -2 }}>
        Lleva tu biblioteca de Windows a Linux.
      </div>
      <div style={{ display: 'flex', maxWidth: 900, fontWeight: 500, fontSize: 30, color: palette.muted }}>
        Cómo les fue a jugadores que ya probaron cada juego, según los reportes que aprobó un revisor.
      </div>
    </Frame>,
    { width, height },
  )
  return png(svg)
}
