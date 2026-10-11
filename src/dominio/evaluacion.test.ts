import { describe, expect, it } from '@effect/vitest'
import {
  alMenos,
  type Capacidades,
  capacidades,
  type CondicionesConocidas,
  condiciones,
  type Evaluacion,
  evaluar,
  sugerirPerfil,
  type VeredictoRequisitos,
  versionVulkan,
} from './evaluacion.ts'

const v = (texto: string) => {
  const version = versionVulkan(texto)
  if (version === null) throw new Error(`not a version: ${texto}`)
  return version
}

describe('versionVulkan', () => {
  it.each([
    ['1.3', [1, 3]],
    ['1.3.275', [1, 3, 275]],
    ['2', [2]],
  ])('%s -> %o', (texto, partes) => {
    expect(versionVulkan(texto)).toEqual({ texto, partes })
  })
  it.each([null, '', '1.', '.1', '1..3', 'v1.3', '1.3 ', 'desconocido'])('%o -> null', (texto) => {
    expect(versionVulkan(texto)).toBeNull()
  })
})

describe('alMenos', () => {
  it.each([
    ['1.10', '1.9', true],
    ['1.9', '1.10', false],
    ['1.3', '1.3.0', true],
    ['1.3.0', '1.3', true],
    ['1.2.999', '1.3', false],
    ['2', '1.3', true],
  ])('alMenos(%s, %s) is %s', (version, minimo, esperado) => {
    expect(alMenos(v(version), v(minimo))).toBe(esperado)
  })
})

describe('evaluar (8.10, three outcomes)', () => {
  const equipo: Capacidades = { sistema: 'Linux', ram_mb: 8192, vram_mb: 2048, vulkan: { soporte: 'si', version: v('1.3') } }
  const nada: CondicionesConocidas = { ram_min_mb: null, vram_min_mb: null, requiere_vulkan: null, version_vulkan_min: null }

  const casos: ReadonlyArray<readonly [string, VeredictoRequisitos, Capacidades, CondicionesConocidas]> = [
    ['no stated condition is not a vacuous cumple', 'informacion_insuficiente', equipo, nada],
    ['RAM exactly at the minimum', 'cumple', equipo, { ...nada, ram_min_mb: 8192 }],
    ['RAM one MB short (no tolerance factor)', 'no_cumple', equipo, { ...nada, ram_min_mb: 8193 }],
    ['unknown VRAM', 'informacion_insuficiente', { ...equipo, vram_mb: null }, { ...nada, vram_min_mb: 1024 }],
    ['VRAM below', 'no_cumple', equipo, { ...nada, vram_min_mb: 4096 }],
    ['no_cumple wins over desconocido', 'no_cumple', { ...equipo, vram_mb: null, ram_mb: 4096 }, { ...nada, ram_min_mb: 8192, vram_min_mb: 1024 }],
    ['Vulkan required, no support', 'no_cumple', { ...equipo, vulkan: { soporte: 'no' } }, { ...nada, requiere_vulkan: true }],
    ['Vulkan required, support unknown', 'informacion_insuficiente', { ...equipo, vulkan: { soporte: 'desconocido' } }, { ...nada, requiere_vulkan: true }],
    ['Vulkan required, no minimum version', 'cumple', equipo, { ...nada, requiere_vulkan: true }],
    ['Vulkan minimum, version unknown', 'informacion_insuficiente', { ...equipo, vulkan: { soporte: 'si', version: null } }, { ...nada, requiere_vulkan: true, version_vulkan_min: v('1.1') }],
    ['Vulkan 1.10 meets 1.9', 'cumple', { ...equipo, vulkan: { soporte: 'si', version: v('1.10') } }, { ...nada, requiere_vulkan: true, version_vulkan_min: v('1.9') }],
    ['Vulkan 1.2 misses 1.3', 'no_cumple', { ...equipo, vulkan: { soporte: 'si', version: v('1.2') } }, { ...nada, requiere_vulkan: true, version_vulkan_min: v('1.3') }],
    ['requiere_vulkan false is not a condition', 'cumple', { ...equipo, vulkan: { soporte: 'no' } }, { ...nada, ram_min_mb: 4096, requiere_vulkan: false }],
  ]
  it.each(casos)('%s -> %s', (_, veredicto, eq, cond) => {
    expect(evaluar(eq, cond).veredicto).toBe(veredicto)
  })

  it('lists one check per stated condition with what was required and detected', () => {
    const r = evaluar({ ...equipo, vram_mb: null }, { ram_min_mb: 8192, vram_min_mb: 1024, requiere_vulkan: true, version_vulkan_min: v('1.1') })
    expect(r.comprobaciones).toEqual([
      { requisito: 'ram', estado: 'cumple', exigido: '8192', detectado: '8192' },
      { requisito: 'vram', estado: 'desconocido', exigido: '1024', detectado: null },
      { requisito: 'vulkan', estado: 'cumple', exigido: '1.1', detectado: '1.3' },
    ])
  })

  it('a Windows capture is orientation only, with the same verdict rules', () => {
    const r = evaluar({ ...equipo, sistema: 'Windows' }, { ...nada, ram_min_mb: 4096 })
    expect(r).toMatchObject({ veredicto: 'cumple', solo_orientativa: true })
    expect(evaluar(equipo, { ...nada, ram_min_mb: 4096 }).solo_orientativa).toBe(false)
  })

  it('has no field that could carry FPS', () => {
    const claves = (e: Evaluacion) => [...Object.keys(e), ...e.comprobaciones.flatMap((c) => Object.keys(c))]
    expect(claves(evaluar(equipo, { ...nada, ram_min_mb: 1 })).filter((k) => /fps/i.test(k))).toEqual([])
  })
})

describe('column adapters', () => {
  it('drop a Vulkan version that arrives without support si', () => {
    expect(capacidades({ sistema: 'Linux', ram_mb: 1, vram_mb: null, soporte_vulkan: 'desconocido', version_vulkan: '1.4.318' }).vulkan).toEqual({ soporte: 'desconocido' })
    expect(capacidades({ sistema: 'Linux', ram_mb: 1, vram_mb: null, soporte_vulkan: 'si', version_vulkan: '1.3' }).vulkan).toEqual({ soporte: 'si', version: v('1.3') })
  })
  it('parse the profile minimum version', () => {
    expect(condiciones({ ram_min_mb: null, vram_min_mb: null, requiere_vulkan: true, version_vulkan_min: '1.3' }).version_vulkan_min).toEqual(v('1.3'))
  })
})

describe('sugerirPerfil', () => {
  const evaluacion = (veredicto: VeredictoRequisitos): Evaluacion => ({ veredicto, comprobaciones: [], solo_orientativa: false })
  const perfil = (nombre: string, distribucion_id: number, veredicto: VeredictoRequisitos | null, revision = 1, arquitectura = 'x86_64') => ({
    nombre,
    distribucion_id,
    arquitectura,
    revision,
    evaluacion: veredicto === null ? null : evaluacion(veredicto),
  })
  const mint = { distribucion_id: 1, arquitectura: 'x86_64' }

  it('returns null with no approved profiles', () => {
    expect(sugerirPerfil([], mint)).toBeNull()
  })
  it('same distribution and architecture beats a better verdict elsewhere', () => {
    expect(sugerirPerfil([perfil('fedora', 3, 'cumple'), perfil('mint', 1, 'no_cumple')], mint)?.nombre).toBe('mint')
  })
  it('another architecture on the same distribution does not count as a match', () => {
    expect(sugerirPerfil([perfil('arm', 1, 'cumple', 1, 'aarch64'), perfil('fedora', 3, 'cumple', 2)], mint)?.nombre).toBe('fedora')
  })
  it('then cumple > informacion_insuficiente (or not evaluated) > no_cumple', () => {
    expect(sugerirPerfil([perfil('no', 1, 'no_cumple'), perfil('insuf', 1, null), perfil('si', 1, 'cumple')], mint)?.nombre).toBe('si')
    expect(sugerirPerfil([perfil('no', 1, 'no_cumple'), perfil('insuf', 1, null)], mint)?.nombre).toBe('insuf')
  })
  it('then the highest revision', () => {
    expect(sugerirPerfil([perfil('r1', 1, 'cumple', 1), perfil('r3', 1, 'cumple', 3), perfil('r2', 1, 'cumple', 2)], mint)?.nombre).toBe('r3')
  })
  it('a Windows diagnosis (no distribution) still gets a suggestion by verdict', () => {
    expect(sugerirPerfil([perfil('no', 1, 'no_cumple'), perfil('si', 2, 'cumple')], { distribucion_id: null, arquitectura: 'x86_64' })?.nombre).toBe('si')
  })
})
