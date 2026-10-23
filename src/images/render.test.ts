import { expect, it } from '@effect/vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { CompatibilityStatus } from '../domain/compatibility.ts'
import { en } from '../ui/i18n/en.ts'
import { es } from '../ui/i18n/es.ts'
import { badgeSvg, gamePreviewPng, palette } from './render.tsx'

it('uses the colors styles.css defines', () => {
  const css = readFileSync(join(import.meta.dirname, '../styles.css'), 'utf8')
  const defined = Object.fromEntries([...css.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6});/g)].map(([, name, value]) => [name, value]))
  expect(palette).toEqual(Object.fromEntries(Object.keys(palette).map((name) => [name, defined[name]])))
})

it('names each state in its badge, in the state color', async () => {
  for (const status of CompatibilityStatus.literals) {
    const svg = await badgeSvg({ status, demo: false }, es)
    expect(svg).toMatch(/^<svg [^>]*><title>OpenGame Linux: [^<]+<\/title>/)
  }
  expect(await badgeSvg({ status: 'no_inicia', demo: false }, es)).toContain(`fill="${palette.red}"`)
  expect(await badgeSvg({ status: 'funciona', demo: true }, es)).toContain('<title>OpenGame Linux: Funciona (datos de ejemplo)</title>')
  expect(await badgeSvg({ status: 'funciona', demo: true }, en)).toContain('<title>OpenGame Linux: Works (demo data)</title>')
})

it('draws the preview at the size the meta tags announce', async () => {
  const png = await gamePreviewPng({ title: 'Elden Ring', status: 'funciona', reports: 3, no_recent_confirmation: false, demo: false }, es)
  const header = new DataView(png.buffer, png.byteOffset, 24)
  expect([header.getUint32(16), header.getUint32(20)]).toEqual([1200, 630])
})
