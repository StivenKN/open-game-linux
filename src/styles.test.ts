// styles.css is plain CSS that three lanes merge into. Browsers accept nesting, so a rule missing its
// `}` silently nests every later rule under it; and a selector restyled in a second rule is how merges
// drift. Nesting is allowed only inside at-rules such as @media, and each selector has one rule.
import { expect, it } from '@effect/vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const css = readFileSync(join(import.meta.dirname, 'styles.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

const rules = () => {
  const open: Array<string> = []
  const found: Array<{ readonly prelude: string; readonly within: ReadonlyArray<string> }> = []
  let start = 0
  for (let i = 0; i < css.length; i++) {
    const c = css[i]
    if (c === '{') {
      const prelude = css.slice(start, i).trim().replace(/\s+/g, ' ')
      found.push({ prelude, within: [...open] })
      open.push(prelude)
      start = i + 1
    } else if (c === '}') {
      open.pop()
      start = i + 1
    } else if (c === ';') start = i + 1
  }
  return { found, unclosed: open }
}

it('styles.css closes every rule before the next one starts', () => {
  const { found, unclosed } = rules()
  const nested = found.filter((r) => r.within.some((p) => !p.startsWith('@'))).map((r) => [...r.within, r.prelude].join(' > '))
  expect(nested, 'a rule above is missing its closing brace').toEqual([])
  expect(unclosed, 'unclosed rules at the end of styles.css').toEqual([])
})

it('styles.css styles each selector in one rule', () => {
  const seen = new Map<string, number>()
  for (const r of rules().found.filter((r) => !r.prelude.startsWith('@')))
    for (const selector of r.prelude.split(',')) {
      const key = [...r.within, selector.trim()].join(' > ')
      seen.set(key, (seen.get(key) ?? 0) + 1)
    }
  expect([...seen].filter(([, n]) => n > 1).map(([s]) => s), 'merge these into the rule that already styles them').toEqual([])
})
