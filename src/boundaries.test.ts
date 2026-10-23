import { describe, expect, it } from '@effect/vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const root = join(import.meta.dirname, '..')
const files = (dir: string): ReadonlyArray<string> =>
  readdirSync(join(root, dir)).flatMap((n) => {
    const p = join(dir, n)
    return statSync(join(root, p)).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(n) && !n.endsWith('.gen.ts') ? [p] : []
  })
const read = (p: string) => readFileSync(join(root, p), 'utf8')
const importsOf = (code: string) => [...code.matchAll(/^\s*import\s[^'"]*['"]([^'"]+)['"]/gm)].map((m) => m[1] ?? '')

const layers = {
  'src/domain/': { allowed: ['effect', 'src/domain/'], fix: 'domain is pure and isomorphic; move I/O to server/' },
  'src/server/': {
    allowed: ['effect', '@effect/', 'better-auth', 'pg', 'node:crypto', '@tanstack/react-start/server', '@tanstack/react-router', 'src/domain/', 'src/server/'],
    fix: 'server must not reach fns/, routes/ or ui/',
  },
  'src/fns/': { allowed: ['@tanstack/react-start', 'effect', 'src/domain/', 'src/server/'], fix: 'fns/ is the server-fn boundary only' },
  'src/routes/': {
    allowed: ['@tanstack/', 'react', 'effect', 'src/domain/', 'src/fns/', 'src/ui/', 'src/routes/', 'src/detector/', 'src/styles.css', 'assets/', '@fontsource-variable/', 'better-auth/react'],
    fix: 'routes call server fns from src/fns/; never import src/server/ (it would ship pg to the browser)',
  },
  'src/ui/': { allowed: ['react', 'effect', '@tanstack/react-router', 'src/domain/', 'src/ui/'], fix: 'ui is plain React over domain types' },
} as const

const exceptions = new Set(['src/routes/api/auth/$.ts', 'src/routes/opengame-detect[.]sh.ts', 'src/routes/opengame-detect[.]ps1.ts'])

const resolve = (from: string, spec: string) => (spec.startsWith('.') ? relative(root, join(root, from, '..', spec)) : spec)

describe('boundaries', () => {
  for (const [layer, { allowed, fix }] of Object.entries(layers)) {
    it(`${layer} only imports what it may`, () => {
      const violations = files(layer)
        .filter((f) => !exceptions.has(f) && !f.endsWith('.test.ts'))
        .flatMap((f) =>
          importsOf(read(f))
            .map((s) => resolve(f, s))
            .filter((s) => !allowed.some((p) => s === p || s.startsWith(p) || s.startsWith(`${p}/`)))
            .map((s) => `${f} imports ${s}: ${fix}`),
        )
      expect(violations).toEqual([])
    })
  }

  it('fns/ files hold only imports and createServerFn exports (spike gotcha 3)', () => {
    const violations = files('src/fns').flatMap((f) =>
      read(f)
        .split('\n')
        .filter((l) => /^\S/.test(l) && !/^(import\b|export const \w+ = createServerFn\b|\/\/|\/\*\*|\*|\)|\})/.test(l))
        .map((l) => `${f}: "${l.trim()}" runs at module scope and ships to the browser; move it into src/server/`),
    )
    expect(violations).toEqual([])
  })

  it('only server/commands/review.ts writes the review block (8.9 single writer)', () => {
    const write = /`[^`]*\b(SET|INSERT INTO)\b[^`]*\b(review_status|reviewer_id|review_evidence)\b[^`]*`/s
    const violations = [...files('src'), ...files('scripts')]
      .filter((f) => f !== 'src/server/commands/review.ts' && !f.startsWith('src/server/schema/') && write.test(read(f)))
      .map((f) => `${f} writes the review block; call decide() from server/commands/review.ts instead`)
    expect(violations).toEqual([])
  })

  it('only server/commands/diagnostic.ts writes machine and diagnostic (RF-04 single writer)', () => {
    const write = /\b(INSERT INTO|UPDATE)\s+(machine|diagnostic)\b/
    const violations = [...files('src'), ...files('scripts')]
      .filter((f) => f !== 'src/server/commands/diagnostic.ts' && !f.startsWith('src/server/schema/') && write.test(read(f)))
      .map((f) => `${f} writes machine or diagnostic; call submitDiagnostic() from server/commands/diagnostic.ts instead`)
    expect(violations).toEqual([])
  })

  it('only server/external/protondb.ts writes protondb_summary (external evidence single writer)', () => {
    const write = /\b(INSERT INTO|UPDATE|DELETE FROM|TRUNCATE)\s+(TABLE\s+)?protondb_summary\b/
    const violations = [...files('src'), ...files('scripts')]
      .filter((f) => f !== 'src/server/external/protondb.ts' && !f.startsWith('src/server/schema/') && write.test(read(f)))
      .map((f) => `${f} writes protondb_summary; call importProtonDb() from server/external/protondb.ts instead`)
    expect(violations).toEqual([])
  })

  it("only server/commands/accounts.ts writes an account's role and active flag (single writer)", () => {
    const write = /`[^`]*\bUPDATE\s+app_user\b[^`]*\b(role|active)\s*=[^`]*`/s
    const violations = [...files('src'), ...files('scripts')]
      .filter((f) => f !== 'src/server/commands/accounts.ts' && !f.startsWith('src/server/schema/') && write.test(read(f)))
      .map((f) => `${f} writes app_user.role or app_user.active; call changeAccess() from server/commands/accounts.ts instead`)
    expect(violations).toEqual([])
  })

  it('only server/commands/contributions.ts writes profiles and guides (authoring single writer)', () => {
    const write = /\b(INSERT INTO|UPDATE|DELETE FROM)\s+(profile|profile_step|profile_dependency|adoption_guide)\b/
    const violations = [...files('src'), ...files('scripts')]
      .filter((f) => f !== 'src/server/commands/contributions.ts' && !f.startsWith('src/server/schema/') && write.test(read(f)))
      .map((f) => `${f} writes a profile or a guide; call proposeProfile(), editProfile(), deleteProfile(), createGuide() or editGuide() instead`)
    expect(violations).toEqual([])
  })

  it('only server/commands/game-requests.ts writes game_request and game_request_user (single writer)', () => {
    const write = /\b(INSERT INTO|UPDATE|DELETE FROM)\s+game_request(_user)?\b/
    const violations = [...files('src'), ...files('scripts')]
      .filter((f) => f !== 'src/server/commands/game-requests.ts' && !f.startsWith('src/server/schema/') && write.test(read(f)))
      .map((f) => `${f} writes game_request; call requestGame(), withdrawRequest(), rejectRequest() or fulfillRequests() from server/commands/game-requests.ts instead`)
    expect(violations).toEqual([])
  })

  it('only server/external/anticheat.ts writes anticheat_entry (external evidence single writer)', () => {
    const write = /\b(INSERT INTO|UPDATE|DELETE FROM|TRUNCATE)\s+(TABLE\s+)?anticheat_entry\b/
    const violations = [...files('src'), ...files('scripts')]
      .filter((f) => f !== 'src/server/external/anticheat.ts' && !f.startsWith('src/server/schema/') && write.test(read(f)))
      .map((f) => `${f} writes anticheat_entry; call importAntiCheat() from server/external/anticheat.ts instead`)
    expect(violations).toEqual([])
  })

  it('only server/external/sources.ts writes external_import (single writer)', () => {
    const write = /\b(INSERT INTO|UPDATE|DELETE FROM|TRUNCATE)\s+(TABLE\s+)?external_import\b/
    const violations = [...files('src'), ...files('scripts')]
      .filter((f) => f !== 'src/server/external/sources.ts' && !f.startsWith('src/server/schema/') && write.test(read(f)))
      .map((f) => `${f} writes external_import; an importer calls recordImport() from server/external/sources.ts inside its transaction`)
    expect(violations).toEqual([])
  })

  it('only server/commands/upstream.ts writes upstream_fix (single writer)', () => {
    const write = /\b(INSERT INTO|UPDATE|DELETE FROM)\s+upstream_fix\b/
    const violations = [...files('src'), ...files('scripts')]
      .filter((f) => f !== 'src/server/commands/upstream.ts' && !f.startsWith('src/server/schema/') && write.test(read(f)))
      .map((f) => `${f} writes upstream_fix; call noteFix() from server/commands/upstream.ts instead`)
    expect(violations).toEqual([])
  })

  it('only server/commands/follow.ts writes game_follow (single writer)', () => {
    const write = /\b(INSERT INTO|UPDATE|DELETE FROM)\s+game_follow\b/
    const violations = [...files('src'), ...files('scripts')]
      .filter((f) => f !== 'src/server/commands/follow.ts' && !f.startsWith('src/server/schema/') && write.test(read(f)))
      .map((f) => `${f} writes game_follow; call changeFollow() from server/commands/follow.ts instead`)
    expect(violations).toEqual([])
  })
})
