// Generated cover art. Everything is seeded from the title, so a game gets the same cover on the
// catalog, the hero stack and its own page, and SSR and the browser draw the same shapes.

export const motivos = ['sol', 'franjas', 'picos', 'anillos', 'bloques'] as const
export type Motivo = (typeof motivos)[number]

/** FNV-1a over the characters of the text. */
export const semilla = (texto: string) => {
  let h = 2166136261
  for (const c of texto) {
    h ^= c.charCodeAt(0)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** mulberry32: a tiny PRNG returning floats in [0, 1). */
export const azar = (inicial: number) => {
  let a = inicial
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const disenoPortada = (titulo: string) => {
  const r = azar(semilla(titulo))
  const matiz = Math.floor(r() * 360)
  const motivo = motivos[Math.floor(r() * motivos.length)]
  const t = azar(semilla(`${titulo}tipo`))
  const estrecho = t() < 0.5
  const arriba = t() < 0.4
  const largo = Math.max(...titulo.split(/[\s-]/).map((p) => p.length))
  const tamano = estrecho ? Math.min(60, 180 / (largo * 0.5)) : Math.min(34, 180 / (largo * 0.8))
  return {
    matiz,
    motivo,
    // Font size in cqi of the cover width, so the longest word fits whatever size the cover renders at.
    rotulo: { estrecho, arriba, tamano: Math.round((tamano / 2.2) * 100) / 100 },
    trazo: semilla(`${titulo}${motivo}`),
  }
}
