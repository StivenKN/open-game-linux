// styles.css is plain CSS, but browsers accept nesting: a rule missing its `}` (a bad merge) silently
// nests every later rule under it. Nesting is allowed only inside at-rules such as @media.
import { expect, it } from '@effect/vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const css = readFileSync(join(import.meta.dirname, 'styles.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

it('styles.css closes every rule before the next one starts', () => {
  const abiertos: Array<string> = []
  const anidados: Array<string> = []
  let inicio = 0
  for (let i = 0; i < css.length; i++) {
    const c = css[i]
    if (c === '{') {
      const preludio = css.slice(inicio, i).trim()
      const padre = abiertos.at(-1)
      if (padre !== undefined && !padre.startsWith('@')) anidados.push(`${padre} > ${preludio}`)
      abiertos.push(preludio)
      inicio = i + 1
    } else if (c === '}') {
      abiertos.pop()
      inicio = i + 1
    } else if (c === ';') inicio = i + 1
  }
  expect(anidados, 'a rule above is missing its closing brace').toEqual([])
  expect(abiertos, 'unclosed rules at the end of styles.css').toEqual([])
})
