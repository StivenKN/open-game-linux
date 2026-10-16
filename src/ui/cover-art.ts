// Generated cover art. Everything is seeded from the title, so a game gets the same cover on the
// catalog, the hero stack and its own page, and SSR and the browser draw the same shapes.

export const motifs = ['sol', 'franjas', 'picos', 'anillos', 'bloques'] as const
export type Motif = (typeof motifs)[number]

/** FNV-1a over the characters of the text. */
export const seed = (text: string) => {
  let h = 2166136261
  for (const c of text) {
    h ^= c.charCodeAt(0)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** mulberry32: a tiny PRNG returning floats in [0, 1). */
export const seededRandom = (initial: number) => {
  let a = initial
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const coverDesign = (title: string) => {
  const r = seededRandom(seed(title))
  const hue = Math.floor(r() * 360)
  const motif = motifs[Math.floor(r() * motifs.length)]
  const t = seededRandom(seed(`${title}tipo`))
  const narrow = t() < 0.5
  const atTop = t() < 0.4
  const maxLength = Math.max(...title.split(/[\s-]/).map((p) => p.length))
  const size = narrow ? Math.min(60, 180 / (maxLength * 0.5)) : Math.min(34, 180 / (maxLength * 0.8))
  return {
    hue,
    motif,
    // Font size in cqi of the cover width, so the longest word fits whatever size the cover renders at.
    caption: { narrow, atTop, size: Math.round((size / 2.2) * 100) / 100 },
    strokeSeed: seed(`${title}${motif}`),
  }
}
