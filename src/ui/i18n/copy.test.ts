// Interface copy lives in the dictionaries (`ui/i18n/es/`, `ui/i18n/en/`), so both languages show it. This
// fails when Spanish is written into a component again: a Spanish-only character anywhere in the code, or a
// common Spanish word as JSX text. Comments are skipped, and so is the dev-only sample gallery.
import { expect, it } from '@effect/vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const root = join(import.meta.dirname, '../../..')
const files = (dir: string): ReadonlyArray<string> =>
  readdirSync(join(root, dir)).flatMap((n) => {
    const p = join(dir, n)
    return statSync(join(root, p)).isDirectory() ? files(p) : /\.tsx?$/.test(n) ? [p] : []
  })

const exempt = (f: string) =>
  f.startsWith('src/ui/i18n/es/') || f.startsWith('src/ui/i18n/en/') || f.endsWith('.test.ts') || f.includes('[_]muestras') || f === 'src/ui/samples/fixtures.ts'

// `//` after a colon or a quote is a URL, not a comment.
const code = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')

const spanishLetter = /[áéíóúñ¿¡]/i
const spanishWord = /\b(el|la|los|las|del|que|para|con|una|por|sin|tu|tus|juego|juegos|reporte|reportes|perfil|equipo)\b/i

const findings = (f: string) => {
  const lines = code(readFileSync(join(root, f), 'utf8')).split('\n')
  const letters = lines.flatMap((l, i) => (spanishLetter.test(l) ? [`${f}:${i + 1}: ${l.trim()}`] : []))
  const jsxText = [...lines.join('\n').matchAll(/>([^<>{}=]+)</g)].flatMap(([, text = '']) => (spanishWord.test(text) ? [`${f}: >${text.trim()}<`] : []))
  return [...letters, ...jsxText]
}

it('keeps Spanish interface copy out of components', () => {
  const scanned = ['src/routes', 'src/ui', 'src/images'].flatMap(files).map((f) => relative(root, join(root, f))).filter((f) => !exempt(f))
  expect(scanned.flatMap(findings)).toEqual([])
})
