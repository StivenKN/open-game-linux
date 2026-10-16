import { describe, expect, it } from '@effect/vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const raiz = join(import.meta.dirname, '..')
const archivos = (dir: string): ReadonlyArray<string> =>
  readdirSync(join(raiz, dir)).flatMap((n) => {
    const p = join(dir, n)
    return statSync(join(raiz, p)).isDirectory() ? archivos(p) : /\.(ts|tsx)$/.test(n) && !n.endsWith('.gen.ts') ? [p] : []
  })
const leer = (p: string) => readFileSync(join(raiz, p), 'utf8')
const importsDe = (codigo: string) => [...codigo.matchAll(/^\s*import\s[^'"]*['"]([^'"]+)['"]/gm)].map((m) => m[1] ?? '')

const capas = {
  'src/domain/': { permitidos: ['effect', 'src/domain/'], arreglo: 'domain is pure and isomorphic; move I/O to server/' },
  'src/server/': {
    permitidos: ['effect', '@effect/', 'better-auth', 'pg', '@tanstack/react-start/server', '@tanstack/react-router', 'src/domain/', 'src/server/'],
    arreglo: 'server must not reach fns/, routes/ or ui/',
  },
  'src/fns/': { permitidos: ['@tanstack/react-start', 'effect', 'src/domain/', 'src/server/'], arreglo: 'fns/ is the server-fn boundary only' },
  'src/routes/': {
    permitidos: ['@tanstack/', 'react', 'effect', 'src/domain/', 'src/fns/', 'src/ui/', 'src/routes/', 'src/detector/', 'src/styles.css', 'assets/', '@fontsource-variable/', 'better-auth/react'],
    arreglo: 'routes call server fns from src/fns/; never import src/server/ (it would ship pg to the browser)',
  },
  'src/ui/': { permitidos: ['react', 'effect', '@tanstack/react-router', 'src/domain/', 'src/ui/'], arreglo: 'ui is plain React over domain types' },
} as const

const excepciones = new Set(['src/routes/api/auth/$.ts', 'src/routes/opengame-detect[.]sh.ts', 'src/routes/opengame-detect[.]ps1.ts'])

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
        .map((l) => `${f}: "${l.trim()}" runs at module scope and ships to the browser; move it into src/server/`),
    )
    expect(violaciones).toEqual([])
  })

  it('only server/commands/review.ts writes the review block (8.9 single writer)', () => {
    const escritura = /`[^`]*\b(SET|INSERT INTO)\b[^`]*\b(review_status|reviewer_id|review_evidence)\b[^`]*`/s
    const violaciones = [...archivos('src'), ...archivos('scripts')]
      .filter((f) => f !== 'src/server/commands/review.ts' && !f.startsWith('src/server/schema/') && escritura.test(leer(f)))
      .map((f) => `${f} writes the review block; call decidir() from server/commands/review.ts instead`)
    expect(violaciones).toEqual([])
  })

  it('only server/commands/diagnostic.ts writes equipo and diagnostico (RF-04 single writer)', () => {
    const escritura = /\b(INSERT INTO|UPDATE)\s+(equipo|diagnostico)\b/
    const violaciones = [...archivos('src'), ...archivos('scripts')]
      .filter((f) => f !== 'src/server/commands/diagnostic.ts' && !f.startsWith('src/server/schema/') && escritura.test(leer(f)))
      .map((f) => `${f} writes equipo or diagnostico; call registrarDiagnostico() from server/commands/diagnostic.ts instead`)
    expect(violaciones).toEqual([])
  })

  it('only server/external/protondb.ts writes protondb_summary (external evidence single writer)', () => {
    const escritura = /\b(INSERT INTO|UPDATE|DELETE FROM|TRUNCATE)\s+(TABLE\s+)?protondb_summary\b/
    const violaciones = [...archivos('src'), ...archivos('scripts')]
      .filter((f) => f !== 'src/server/external/protondb.ts' && !f.startsWith('src/server/schema/') && escritura.test(leer(f)))
      .map((f) => `${f} writes protondb_summary; call importProtonDb() from server/external/protondb.ts instead`)
    expect(violaciones).toEqual([])
  })

  it('only server/commands/upstream.ts writes upstream_fix (single writer)', () => {
    const escritura = /\b(INSERT INTO|UPDATE|DELETE FROM)\s+upstream_fix\b/
    const violaciones = [...archivos('src'), ...archivos('scripts')]
      .filter((f) => f !== 'src/server/commands/upstream.ts' && !f.startsWith('src/server/schema/') && escritura.test(leer(f)))
      .map((f) => `${f} writes upstream_fix; call noteFix() from server/commands/upstream.ts instead`)
    expect(violaciones).toEqual([])
  })
})
