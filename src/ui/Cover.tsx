import { type ReactNode, useId } from 'react'
import type { CompatibilityStatus } from '../domain/compatibility.ts'
import { seededRandom, coverDesign, type Motif } from './cover-art.ts'
import { DemoStamp } from './DemoStamp.tsx'
import { compatibilityStatus } from './vocabulary.ts'

type Canvas = {
  readonly id: string
  readonly r: () => number
  readonly width: number
  readonly height: number
  readonly color: (hueShift: number, saturation: number, lightness: number) => string
}

const times = <T,>(n: number, f: (i: number) => T) => Array.from({ length: n }, (_, i) => f(i))

const motifDrawings = {
  sol: ({ r, width, height, color }) => {
    const cx = width * (0.3 + r() * 0.4)
    const cy = height * (0.28 + r() * 0.12)
    const radius = Math.min(width, height) * 0.42
    return (
      <>
        {times(5, (i) => 5 - i).map((i) => (
          <circle key={`c${i}`} cx={cx} cy={cy} r={(radius * i) / 5} fill={color(i * 9, 45, 20 + i * 6)} />
        ))}
        {times(7, (i) => (
          <rect key={`f${i}`} y={height * 0.55 + i * height * 0.065} width={width} height={height * 0.032} fill={color(-30, 35, 16 + i * 2)} />
        ))}
      </>
    )
  },
  franjas: ({ r, width, height, color }) => {
    const n = 7 + Math.floor(r() * 4)
    const angle = -30 + r() * 60
    return (
      <g transform={`rotate(${angle} ${width / 2} ${height / 2})`}>
        {times(n + 8, (k) => k - 4).map((i) => (
          <rect key={i} x={-width} y={(i * height) / n} width={width * 3} height={(height / n) * 0.55} fill={color(i % 2 ? 40 : -20, 48, 22 + (i % 3) * 8)} />
        ))}
      </g>
    )
  },
  picos: ({ r, width, height, color }) => (
    <>
      {times(4, (k) => {
        const base = height * (0.35 + k * 0.16)
        const step = width / (4 + k * 2)
        const peaks = times(5 + k * 2, (j) => `${j * step},${base - r() * height * 0.22}`)
        return <polygon key={k} points={`0,${height} ${peaks.join(' ')} ${width},${height}`} fill={color(k * 14 - 20, 40, 30 - k * 5)} />
      })}
      <circle cx={width * (0.2 + r() * 0.6)} cy={height * 0.18} r={Math.min(width, height) * 0.09} fill={color(30, 55, 62)} />
    </>
  ),
  anillos: ({ id, r, width, height, color }) => {
    const cell = Math.max(14, Math.min(width, height) / 14)
    const cx = width * (0.55 + r() * 0.3)
    const cy = height * (0.3 + r() * 0.2)
    const radius = Math.min(width, height) * 0.38
    return (
      <>
        <pattern id={`${id}puntos`} width={cell} height={cell} patternUnits="userSpaceOnUse">
          <circle cx={cell / 2} cy={cell / 2} r={cell * 0.11} fill={color(20, 30, 40)} />
        </pattern>
        <rect width={width} height={height} fill={`url(#${id}puntos)`} />
        <circle cx={cx} cy={cy} r={radius} fill="none" stroke={color(-35, 55, 52)} strokeWidth={radius * 0.28} />
        <circle cx={cx - radius * 0.9} cy={cy + radius * 0.8} r={radius * 0.35} fill={color(40, 45, 38)} />
      </>
    )
  },
  bloques: ({ r, width, height, color }) =>
    times(14, (i) => {
      const w = width * (0.15 + r() * 0.4)
      const h = height * (0.08 + r() * 0.25)
      const x = r() * width - w / 3
      const y = r() * height - h / 3
      return <rect key={i} x={x} y={y} width={w} height={h} rx={Math.min(w, h) * 0.12} fill={color(((i * 23) % 90) - 45, 42, 18 + r() * 28)} opacity={0.9} />
    }),
} satisfies Record<Motif, (canvas: Canvas) => ReactNode>

/** The seeded artwork alone, at any aspect ratio: covers use 300×400, the game page banner a wide one. */
export function Artwork({ title, width, height }: { title: string; width: number; height: number }) {
  // useId keeps gradient ids unique per cover and identical between SSR and hydration.
  const id = useId()
  const { hue, motif, strokeSeed } = coverDesign(title)
  const color = (hueShift: number, saturation: number, lightness: number) => `hsl(${(hue + hueShift + 360) % 360} ${saturation}% ${lightness}%)`
  return (
    <svg className="arte" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id={`${id}fondo`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={color(0, 42, 26)} />
          <stop offset="1" stopColor={color(50, 38, 12)} />
        </linearGradient>
        <linearGradient id={`${id}sombra`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0.45" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.55" />
        </linearGradient>
      </defs>
      <rect width={width} height={height} fill={`url(#${id}fondo)`} />
      {motifDrawings[motif]({ id, r: seededRandom(strokeSeed), width, height, color })}
      <rect width={width} height={height} fill={`url(#${id}sombra)`} />
    </svg>
  )
}

/** A game's cover: seeded art, its title, and a status band that is the loudest thing on it. */
export function Cover({ title, status, sample = false }: { title: string; status?: CompatibilityStatus; sample?: boolean }) {
  const { caption } = coverDesign(title)
  return (
    <div className="portada" data-estado={status}>
      <Artwork title={title} width={300} height={400} />
      {sample && <DemoStamp />}
      <div
        className="portada-rotulo"
        data-letra={caption.narrow ? 'estrecha' : 'ancha'}
        data-arriba={caption.atTop || undefined}
        style={{ fontSize: `${caption.size}cqi` }}
        aria-hidden="true"
      >
        {title}
      </div>
      {status && <StatusBand status={status} />}
    </div>
  )
}

function StatusBand({ status }: { status: CompatibilityStatus }) {
  const label = compatibilityStatus[status]
  return (
    <div className="banda" data-tono={label.tone} data-forma="relleno" data-estado={status}>
      <span className="banda-icono" aria-hidden="true">
        {label.icon}
      </span>
      {label.text}
    </div>
  )
}
