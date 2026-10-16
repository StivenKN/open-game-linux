import { describe, expect, it } from '@effect/vitest'
import {
  atLeast,
  type Capabilities,
  type KnownRequirements,
  requirements,
  type Evaluation,
  evaluate,
  suggestProfile,
  type RequirementsVerdict,
  vulkanVersion,
} from './evaluation.ts'

const v = (text: string) => {
  const version = vulkanVersion(text)
  if (version === null) throw new Error(`not a version: ${text}`)
  return version
}

describe('vulkanVersion', () => {
  it.each([
    ['1.3', [1, 3]],
    ['1.3.275', [1, 3, 275]],
    ['2', [2]],
  ])('%s -> %o', (text, parts) => {
    expect(vulkanVersion(text)).toEqual({ text, parts })
  })
  it.each([null, '', '1.', '.1', '1..3', 'v1.3', '1.3 ', 'desconocido'])('%o -> null', (text) => {
    expect(vulkanVersion(text)).toBeNull()
  })
})

describe('atLeast', () => {
  it.each([
    ['1.10', '1.9', true],
    ['1.9', '1.10', false],
    ['1.3', '1.3.0', true],
    ['1.3.0', '1.3', true],
    ['1.2.999', '1.3', false],
    ['2', '1.3', true],
  ])('alMenos(%s, %s) is %s', (version, minimum, expected) => {
    expect(atLeast(v(version), v(minimum))).toBe(expected)
  })
})

describe('evaluate (8.10, three outcomes)', () => {
  const machine: Capabilities = { sistema: 'Linux', ram_mb: 8192, vram_mb: 2048, vulkan: { support: 'si', origin: 'medido', range: { from: v('1.3'), to: v('1.3') } } }
  const none: KnownRequirements = { ram_min_mb: null, vram_min_mb: null, requiere_vulkan: null, version_vulkan_min: null }

  const cases: ReadonlyArray<readonly [string, RequirementsVerdict, Capabilities, KnownRequirements]> = [
    ['no stated condition is not a vacuous cumple', 'informacion_insuficiente', machine, none],
    ['RAM exactly at the minimum', 'cumple', machine, { ...none, ram_min_mb: 8192 }],
    ['RAM one MB short (no tolerance factor)', 'no_cumple', machine, { ...none, ram_min_mb: 8193 }],
    ['unknown VRAM', 'informacion_insuficiente', { ...machine, vram_mb: null }, { ...none, vram_min_mb: 1024 }],
    ['VRAM below', 'no_cumple', machine, { ...none, vram_min_mb: 4096 }],
    ['no_cumple wins over desconocido', 'no_cumple', { ...machine, vram_mb: null, ram_mb: 4096 }, { ...none, ram_min_mb: 8192, vram_min_mb: 1024 }],
    ['Vulkan required, no support', 'no_cumple', { ...machine, vulkan: { support: 'no', origin: 'medido' } }, { ...none, requiere_vulkan: true }],
    ['Vulkan required, support unknown', 'informacion_insuficiente', { ...machine, vulkan: { support: 'desconocido' } }, { ...none, requiere_vulkan: true }],
    ['Vulkan required, no minimum version', 'cumple', machine, { ...none, requiere_vulkan: true }],
    ['Vulkan minimum, version unknown', 'informacion_insuficiente', { ...machine, vulkan: { support: 'si', origin: 'medido', range: null } }, { ...none, requiere_vulkan: true, version_vulkan_min: v('1.1') }],
    ['Vulkan 1.10 meets 1.9', 'cumple', { ...machine, vulkan: { support: 'si', origin: 'medido', range: { from: v('1.10'), to: v('1.10') } } }, { ...none, requiere_vulkan: true, version_vulkan_min: v('1.9') }],
    ['Vulkan 1.2 misses 1.3', 'no_cumple', { ...machine, vulkan: { support: 'si', origin: 'medido', range: { from: v('1.2'), to: v('1.2') } } }, { ...none, requiere_vulkan: true, version_vulkan_min: v('1.3') }],
    ['requiere_vulkan false is not a condition', 'cumple', { ...machine, vulkan: { support: 'no', origin: 'medido' } }, { ...none, ram_min_mb: 4096, requiere_vulkan: false }],
  ]
  it.each(cases)('%s -> %s', (_, verdict, eq, cond) => {
    expect(evaluate(eq, cond).verdict).toBe(verdict)
  })

  it('lists one check per stated condition with what was required and detected', () => {
    const r = evaluate({ ...machine, vram_mb: null }, { ram_min_mb: 8192, vram_min_mb: 1024, requiere_vulkan: true, version_vulkan_min: v('1.1') })
    expect(r.checks).toEqual([
      { requirement: 'ram', status: 'cumple', required: '8192', detected: { value: '8192', origin: 'medido' } },
      { requirement: 'vram', status: 'desconocido', required: '1024', detected: null },
      { requirement: 'vulkan', status: 'cumple', required: '1.1', detected: { value: '1.3', origin: 'medido' } },
    ])
  })

  describe('projected Vulkan (a range when the level is unverified)', () => {
    const projected = (from: string, to: string): Capabilities => ({
      ...machine,
      sistema: 'Windows',
      vulkan: { support: 'si', origin: 'proyectado', range: { from: v(from), to: v(to) } },
    })
    const minimum = (version: string): KnownRequirements => ({ ...none, requiere_vulkan: true, version_vulkan_min: v(version) })
    const vulkan = (eq: Capabilities, cond: KnownRequirements) => evaluate(eq, cond).checks.find((c) => c.requirement === 'vulkan')

    it('a range above the minimum meets it, labelled as projected', () => {
      expect(vulkan(projected('1.3', '1.4'), minimum('1.3'))).toEqual({ requirement: 'vulkan', status: 'cumple', required: '1.3', detected: { value: '1.3–1.4', origin: 'proyectado' } })
    })
    it('a range below the minimum misses it', () => {
      expect(vulkan(projected('1.2', '1.2'), minimum('1.3'))).toEqual({ requirement: 'vulkan', status: 'no_cumple', required: '1.3', detected: { value: '1.2', origin: 'proyectado' } })
    })
    it('a range that straddles the minimum is unknown, never a false cumple', () => {
      expect(evaluate(projected('1.0', '1.1'), minimum('1.1'))).toMatchObject({ verdict: 'informacion_insuficiente', checks: [{ status: 'desconocido', detected: { value: '1.0–1.1', origin: 'proyectado' } }] })
    })
    it('projected support with no minimum version meets requiere_vulkan', () => {
      expect(vulkan(projected('1.0', '1.1'), { ...none, requiere_vulkan: true })?.status).toBe('cumple')
    })
    it('a family without Vulkan misses requiere_vulkan', () => {
      const noVulkan: Capabilities = { ...machine, vulkan: { support: 'no', origin: 'proyectado' } }
      expect(vulkan(noVulkan, { ...none, requiere_vulkan: true })).toEqual({ requirement: 'vulkan', status: 'no_cumple', required: 'si', detected: { value: 'no', origin: 'proyectado' } })
    })
  })

  it('a Windows capture is orientation only, with the same verdict rules', () => {
    const r = evaluate({ ...machine, sistema: 'Windows' }, { ...none, ram_min_mb: 4096 })
    expect(r).toMatchObject({ verdict: 'cumple', advisory_only: true })
    expect(evaluate(machine, { ...none, ram_min_mb: 4096 }).advisory_only).toBe(false)
  })

  it('has no field that could carry FPS', () => {
    const keys = (e: Evaluation) => [...Object.keys(e), ...e.checks.flatMap((c) => Object.keys(c))]
    expect(keys(evaluate(machine, { ...none, ram_min_mb: 1 })).filter((k) => /fps/i.test(k))).toEqual([])
  })
})

describe('requirements', () => {
  it('parses the profile minimum version', () => {
    expect(requirements({ ram_min_mb: null, vram_min_mb: null, requiere_vulkan: true, version_vulkan_min: '1.3' }).version_vulkan_min).toEqual(v('1.3'))
  })
})

describe('suggestProfile', () => {
  const evaluation = (verdict: RequirementsVerdict): Evaluation => ({ verdict, checks: [], advisory_only: false })
  const profile = (name: string, distribucion_id: number, verdict: RequirementsVerdict | null, revision = 1, arquitectura = 'x86_64') => ({
    nombre: name,
    distribucion_id,
    arquitectura,
    revision,
    evaluation: verdict === null ? null : evaluation(verdict),
  })
  const mint = { distribucion_id: 1, arquitectura: 'x86_64' }

  it('returns null with no approved profiles', () => {
    expect(suggestProfile([], mint)).toBeNull()
  })
  it('same distribution and architecture beats a better verdict elsewhere', () => {
    expect(suggestProfile([profile('fedora', 3, 'cumple'), profile('mint', 1, 'no_cumple')], mint)?.nombre).toBe('mint')
  })
  it('another architecture on the same distribution does not count as a match', () => {
    expect(suggestProfile([profile('arm', 1, 'cumple', 1, 'aarch64'), profile('fedora', 3, 'cumple', 2)], mint)?.nombre).toBe('fedora')
  })
  it('then cumple > informacion_insuficiente (or not evaluated) > no_cumple', () => {
    expect(suggestProfile([profile('no', 1, 'no_cumple'), profile('insuf', 1, null), profile('si', 1, 'cumple')], mint)?.nombre).toBe('si')
    expect(suggestProfile([profile('no', 1, 'no_cumple'), profile('insuf', 1, null)], mint)?.nombre).toBe('insuf')
  })
  it('then the highest revision', () => {
    expect(suggestProfile([profile('r1', 1, 'cumple', 1), profile('r3', 1, 'cumple', 3), profile('r2', 1, 'cumple', 2)], mint)?.nombre).toBe('r3')
  })
  it('a Windows diagnosis (no distribution) still gets a suggestion by verdict', () => {
    expect(suggestProfile([profile('no', 1, 'no_cumple'), profile('si', 2, 'cumple')], { distribucion_id: null, arquitectura: 'x86_64' })?.nombre).toBe('si')
  })
})
