import { type ReactNode, useId } from 'react'
import type { EstadoCompatibilidad } from '../domain/compatibility.ts'
import { azar, disenoPortada, type Motivo } from './cover-art.ts'
import { SelloEjemplo } from './DemoStamp.tsx'
import { estadoCompatibilidad } from './vocabulary.ts'

type Lienzo = {
  readonly id: string
  readonly r: () => number
  readonly ancho: number
  readonly alto: number
  readonly color: (giro: number, saturacion: number, luz: number) => string
}

const veces = <T,>(n: number, f: (i: number) => T) => Array.from({ length: n }, (_, i) => f(i))

const trazos = {
  sol: ({ r, ancho, alto, color }) => {
    const cx = ancho * (0.3 + r() * 0.4)
    const cy = alto * (0.28 + r() * 0.12)
    const radio = Math.min(ancho, alto) * 0.42
    return (
      <>
        {veces(5, (i) => 5 - i).map((i) => (
          <circle key={`c${i}`} cx={cx} cy={cy} r={(radio * i) / 5} fill={color(i * 9, 45, 20 + i * 6)} />
        ))}
        {veces(7, (i) => (
          <rect key={`f${i}`} y={alto * 0.55 + i * alto * 0.065} width={ancho} height={alto * 0.032} fill={color(-30, 35, 16 + i * 2)} />
        ))}
      </>
    )
  },
  franjas: ({ r, ancho, alto, color }) => {
    const n = 7 + Math.floor(r() * 4)
    const angulo = -30 + r() * 60
    return (
      <g transform={`rotate(${angulo} ${ancho / 2} ${alto / 2})`}>
        {veces(n + 8, (k) => k - 4).map((i) => (
          <rect key={i} x={-ancho} y={(i * alto) / n} width={ancho * 3} height={(alto / n) * 0.55} fill={color(i % 2 ? 40 : -20, 48, 22 + (i % 3) * 8)} />
        ))}
      </g>
    )
  },
  picos: ({ r, ancho, alto, color }) => (
    <>
      {veces(4, (k) => {
        const base = alto * (0.35 + k * 0.16)
        const paso = ancho / (4 + k * 2)
        const cimas = veces(5 + k * 2, (j) => `${j * paso},${base - r() * alto * 0.22}`)
        return <polygon key={k} points={`0,${alto} ${cimas.join(' ')} ${ancho},${alto}`} fill={color(k * 14 - 20, 40, 30 - k * 5)} />
      })}
      <circle cx={ancho * (0.2 + r() * 0.6)} cy={alto * 0.18} r={Math.min(ancho, alto) * 0.09} fill={color(30, 55, 62)} />
    </>
  ),
  anillos: ({ id, r, ancho, alto, color }) => {
    const celda = Math.max(14, Math.min(ancho, alto) / 14)
    const cx = ancho * (0.55 + r() * 0.3)
    const cy = alto * (0.3 + r() * 0.2)
    const radio = Math.min(ancho, alto) * 0.38
    return (
      <>
        <pattern id={`${id}puntos`} width={celda} height={celda} patternUnits="userSpaceOnUse">
          <circle cx={celda / 2} cy={celda / 2} r={celda * 0.11} fill={color(20, 30, 40)} />
        </pattern>
        <rect width={ancho} height={alto} fill={`url(#${id}puntos)`} />
        <circle cx={cx} cy={cy} r={radio} fill="none" stroke={color(-35, 55, 52)} strokeWidth={radio * 0.28} />
        <circle cx={cx - radio * 0.9} cy={cy + radio * 0.8} r={radio * 0.35} fill={color(40, 45, 38)} />
      </>
    )
  },
  bloques: ({ r, ancho, alto, color }) =>
    veces(14, (i) => {
      const w = ancho * (0.15 + r() * 0.4)
      const h = alto * (0.08 + r() * 0.25)
      const x = r() * ancho - w / 3
      const y = r() * alto - h / 3
      return <rect key={i} x={x} y={y} width={w} height={h} rx={Math.min(w, h) * 0.12} fill={color(((i * 23) % 90) - 45, 42, 18 + r() * 28)} opacity={0.9} />
    }),
} satisfies Record<Motivo, (lienzo: Lienzo) => ReactNode>

/** The seeded artwork alone, at any aspect ratio: covers use 300×400, the game page banner a wide one. */
export function Arte({ titulo, ancho, alto }: { titulo: string; ancho: number; alto: number }) {
  // useId keeps gradient ids unique per cover and identical between SSR and hydration.
  const id = useId()
  const { matiz, motivo, trazo } = disenoPortada(titulo)
  const color = (giro: number, saturacion: number, luz: number) => `hsl(${(matiz + giro + 360) % 360} ${saturacion}% ${luz}%)`
  return (
    <svg className="arte" viewBox={`0 0 ${ancho} ${alto}`} preserveAspectRatio="xMidYMid slice" aria-hidden="true">
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
      <rect width={ancho} height={alto} fill={`url(#${id}fondo)`} />
      {trazos[motivo]({ id, r: azar(trazo), ancho, alto, color })}
      <rect width={ancho} height={alto} fill={`url(#${id}sombra)`} />
    </svg>
  )
}

/** A game's cover: seeded art, its title, and a status band that is the loudest thing on it. */
export function Portada({ titulo, estado, ejemplo = false }: { titulo: string; estado?: EstadoCompatibilidad; ejemplo?: boolean }) {
  const { rotulo } = disenoPortada(titulo)
  return (
    <div className="portada" data-estado={estado}>
      <Arte titulo={titulo} ancho={300} alto={400} />
      {ejemplo && <SelloEjemplo />}
      <div
        className="portada-rotulo"
        data-letra={rotulo.estrecho ? 'estrecha' : 'ancha'}
        data-arriba={rotulo.arriba || undefined}
        style={{ fontSize: `${rotulo.tamano}cqi` }}
        aria-hidden="true"
      >
        {titulo}
      </div>
      {estado && <Banda estado={estado} />}
    </div>
  )
}

function Banda({ estado }: { estado: EstadoCompatibilidad }) {
  const etiqueta = estadoCompatibilidad[estado]
  return (
    <div className="banda" data-tono={etiqueta.tono} data-forma="relleno" data-estado={estado}>
      <span className="banda-icono" aria-hidden="true">
        {etiqueta.icono}
      </span>
      {etiqueta.texto}
    </div>
  )
}
