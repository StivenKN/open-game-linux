// styles.css is plain CSS that three lanes merge into. Browsers accept nesting, so a rule missing its
// `}` silently nests every later rule under it; and a selector restyled in a second rule is how merges
// drift. Nesting is allowed only inside at-rules such as @media, and each selector has one rule.
import { expect, it } from '@effect/vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const css = readFileSync(join(import.meta.dirname, 'styles.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

const reglas = () => {
  const abiertos: Array<string> = []
  const encontradas: Array<{ readonly preludio: string; readonly dentroDe: ReadonlyArray<string> }> = []
  let inicio = 0
  for (let i = 0; i < css.length; i++) {
    const c = css[i]
    if (c === '{') {
      const preludio = css.slice(inicio, i).trim().replace(/\s+/g, ' ')
      encontradas.push({ preludio, dentroDe: [...abiertos] })
      abiertos.push(preludio)
      inicio = i + 1
    } else if (c === '}') {
      abiertos.pop()
      inicio = i + 1
    } else if (c === ';') inicio = i + 1
  }
  return { encontradas, sinCerrar: abiertos }
}

it('styles.css closes every rule before the next one starts', () => {
  const { encontradas, sinCerrar } = reglas()
  const anidadas = encontradas.filter((r) => r.dentroDe.some((p) => !p.startsWith('@'))).map((r) => [...r.dentroDe, r.preludio].join(' > '))
  expect(anidadas, 'a rule above is missing its closing brace').toEqual([])
  expect(sinCerrar, 'unclosed rules at the end of styles.css').toEqual([])
})

it('styles.css styles each selector in one rule', () => {
  const vistos = new Map<string, number>()
  for (const r of reglas().encontradas.filter((r) => !r.preludio.startsWith('@')))
    for (const selector of r.preludio.split(',')) {
      const clave = [...r.dentroDe, selector.trim()].join(' > ')
      vistos.set(clave, (vistos.get(clave) ?? 0) + 1)
    }
  expect([...vistos].filter(([, n]) => n > 1).map(([s]) => s), 'merge these into the rule that already styles them').toEqual([])
})
