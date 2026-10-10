// Module boundaries as a test (runs in `pnpm check`). Each failure message names the fix.
// No dependency-cruiser or ESLint plugin: three regexes over the source tree are enough here.
import { describe, expect, it } from '@effect/vitest'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const raiz = join(import.meta.dirname, '..')
// A layer directory appears with the unit that first fills it; until then it has nothing to check.
const archivos = (dir: string): ReadonlyArray<string> =>
  !existsSync(join(raiz, dir)) ? [] : readdirSync(join(raiz, dir)).flatMap((n) => {
    const p = join(dir, n)
    return statSync(join(raiz, p)).isDirectory() ? archivos(p) : /\.(ts|tsx)$/.test(n) && !n.endsWith('.gen.ts') ? [p] : []
  })
const leer = (p: string) => readFileSync(join(raiz, p), 'utf8')
const importsDe = (codigo: string) => [...codigo.matchAll(/^\s*import\s[^'"]*['"]([^'"]+)['"]/gm)].map((m) => m[1] ?? '')

/** Which import specifiers each layer may use. Relative specifiers are resolved against src/. */
const capas = {
  'src/dominio/': { permitidos: ['effect', 'src/dominio/'], arreglo: 'dominio is pure and isomorphic; move I/O to servidor/' },
  'src/servidor/': {
    permitidos: ['effect', '@effect/', 'better-auth', 'pg', '@tanstack/react-start/server', '@tanstack/react-router', 'src/dominio/', 'src/servidor/'],
    arreglo: 'servidor must not reach fns/, routes/ or ui/',
  },
  'src/fns/': { permitidos: ['@tanstack/react-start', 'effect', 'src/dominio/', 'src/servidor/'], arreglo: 'fns/ is the server-fn boundary only' },
  'src/routes/': {
    permitidos: ['@tanstack/', 'react', 'effect', 'src/dominio/', 'src/fns/', 'src/ui/', 'src/routes/', 'src/detector/', 'src/styles.css', 'assets/', 'better-auth/react'],
    arreglo: 'routes call server fns from src/fns/; never import src/servidor/ (it would ship pg to the browser)',
  },
  'src/ui/': { permitidos: ['react', 'effect', '@tanstack/react-router', 'src/dominio/', 'src/ui/'], arreglo: 'ui is plain React over dominio types' },
} as const

/** The only routes allowed to touch servidor/: server-handler files with no component. */
const excepciones = new Set(['src/routes/api/auth/$.ts', 'src/routes/opengame-detect[.]sh.ts'])

const resolver = (desde: string, spec: string) => (spec.startsWith('.') ? relative(raiz, join(raiz, desde, '..', spec)) : spec)

describe('fronteras', () => {
  for (const [capa, { permitidos, arreglo }] of Object.entries(capas)) {
    it(`${capa} only imports what it may`, () => {
      const violaciones = archivos(capa)
        .filter((f) => !excepciones.has(f) && !f.endsWith('.test.ts'))
        .flatMap((f) =>
          importsDe(leer(f))
            .map((s) => resolver(f, s))
            .filter((s) => !permitidos.some((p) => s === p || s.startsWith(p) || s.startsWith(`${p}/`)))
            .map((s) => `${f} imports ${s}: ${arreglo}`),
        )
      expect(violaciones).toEqual([])
    })
  }

  it('fns/ files hold only imports and createServerFn exports (spike gotcha 3)', () => {
    const violaciones = archivos('src/fns').flatMap((f) =>
      leer(f)
        .split('\n')
        .filter((l) => /^\S/.test(l) && !/^(import\b|export const \w+ = createServerFn\b|\/\/|\/\*\*|\*|\)|\})/.test(l))
        .map((l) => `${f}: "${l.trim()}" runs at module scope and ships to the browser; move it into src/servidor/`),
    )
    expect(violaciones).toEqual([])
  })

  it('only servidor/aportes/revision.ts writes the review block (8.9 single writer)', () => {
    const escritura = /`[^`]*\b(SET|INSERT INTO)\b[^`]*\b(estado_revision|revisor_id|evidencia_revision)\b[^`]*`/s
    const violaciones = [...archivos('src'), ...archivos('scripts')]
      .filter((f) => f !== 'src/servidor/aportes/revision.ts' && !f.startsWith('src/servidor/esquema/') && escritura.test(leer(f)))
      .map((f) => `${f} writes the review block; call decidir() from servidor/aportes/revision.ts instead`)
    expect(violaciones).toEqual([])
  })

  it('only servidor/aportes/diagnostico.ts writes equipo and diagnostico (RF-04 single writer)', () => {
    const escritura = /\b(INSERT INTO|UPDATE)\s+(equipo|diagnostico)\b/
    const violaciones = [...archivos('src'), ...archivos('scripts')]
      .filter((f) => f !== 'src/servidor/aportes/diagnostico.ts' && !f.startsWith('src/servidor/esquema/') && escritura.test(leer(f)))
      .map((f) => `${f} writes equipo or diagnostico; call registrarDiagnostico() from servidor/aportes/diagnostico.ts instead`)
    expect(violaciones).toEqual([])
  })
})
