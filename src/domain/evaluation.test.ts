import { describe, expect, it } from '@effect/vitest'
import {
  alMenos,
  type Capacidades,
  type CondicionesConocidas,
  condiciones,
  type Evaluacion,
  evaluar,
  sugerirPerfil,
  type VeredictoRequisitos,
  versionVulkan,
} from './evaluation.ts'

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
  const equipo: Capacidades = { sistema: 'Linux', ram_mb: 8192, vram_mb: 2048, vulkan: { soporte: 'si', origen: 'medido', rango: { desde: v('1.3'), hasta: v('1.3') } } }
  const nada: CondicionesConocidas = { ram_min_mb: null, vram_min_mb: null, requiere_vulkan: null, version_vulkan_min: null }

  const casos: ReadonlyArray<readonly [string, VeredictoRequisitos, Capacidades, CondicionesConocidas]> = [
    ['no stated condition is not a vacuous cumple', 'informacion_insuficiente', equipo, nada],
    ['RAM exactly at the minimum', 'cumple', equipo, { ...nada, ram_min_mb: 8192 }],
    ['RAM one MB short (no tolerance factor)', 'no_cumple', equipo, { ...nada, ram_min_mb: 8193 }],
    ['unknown VRAM', 'informacion_insuficiente', { ...equipo, vram_mb: null }, { ...nada, vram_min_mb: 1024 }],
    ['VRAM below', 'no_cumple', equipo, { ...nada, vram_min_mb: 4096 }],
    ['no_cumple wins over desconocido', 'no_cumple', { ...equipo, vram_mb: null, ram_mb: 4096 }, { ...nada, ram_min_mb: 8192, vram_min_mb: 1024 }],
    ['Vulkan required, no support', 'no_cumple', { ...equipo, vulkan: { soporte: 'no', origen: 'medido' } }, { ...nada, requiere_vulkan: true }],
    ['Vulkan required, support unknown', 'informacion_insuficiente', { ...equipo, vulkan: { soporte: 'desconocido' } }, { ...nada, requiere_vulkan: true }],
    ['Vulkan required, no minimum version', 'cumple', equipo, { ...nada, requiere_vulkan: true }],
    ['Vulkan minimum, version unknown', 'informacion_insuficiente', { ...equipo, vulkan: { soporte: 'si', origen: 'medido', rango: null } }, { ...nada, requiere_vulkan: true, version_vulkan_min: v('1.1') }],
    ['Vulkan 1.10 meets 1.9', 'cumple', { ...equipo, vulkan: { soporte: 'si', origen: 'medido', rango: { desde: v('1.10'), hasta: v('1.10') } } }, { ...nada, requiere_vulkan: true, version_vulkan_min: v('1.9') }],
    ['Vulkan 1.2 misses 1.3', 'no_cumple', { ...equipo, vulkan: { soporte: 'si', origen: 'medido', rango: { desde: v('1.2'), hasta: v('1.2') } } }, { ...nada, requiere_vulkan: true, version_vulkan_min: v('1.3') }],
    ['requiere_vulkan false is not a condition', 'cumple', { ...equipo, vulkan: { soporte: 'no', origen: 'medido' } }, { ...nada, ram_min_mb: 4096, requiere_vulkan: false }],
  ]
  it.each(casos)('%s -> %s', (_, veredicto, eq, cond) => {
    expect(evaluar(eq, cond).veredicto).toBe(veredicto)
  })

  it('lists one check per stated condition with what was required and detected', () => {
    const r = evaluar({ ...equipo, vram_mb: null }, { ram_min_mb: 8192, vram_min_mb: 1024, requiere_vulkan: true, version_vulkan_min: v('1.1') })
    expect(r.comprobaciones).toEqual([
      { requisito: 'ram', estado: 'cumple', exigido: '8192', detectado: { valor: '8192', origen: 'medido' } },
      { requisito: 'vram', estado: 'desconocido', exigido: '1024', detectado: null },
      { requisito: 'vulkan', estado: 'cumple', exigido: '1.1', detectado: { valor: '1.3', origen: 'medido' } },
    ])
  })

  describe('projected Vulkan (a range when the level is unverified)', () => {
    const proyectado = (desde: string, hasta: string): Capacidades => ({
      ...equipo,
      sistema: 'Windows',
      vulkan: { soporte: 'si', origen: 'proyectado', rango: { desde: v(desde), hasta: v(hasta) } },
    })
    const minimo = (version: string): CondicionesConocidas => ({ ...nada, requiere_vulkan: true, version_vulkan_min: v(version) })
    const vulkan = (eq: Capacidades, cond: CondicionesConocidas) => evaluar(eq, cond).comprobaciones.find((c) => c.requisito === 'vulkan')

    it('a range above the minimum meets it, labelled as projected', () => {
      expect(vulkan(proyectado('1.3', '1.4'), minimo('1.3'))).toEqual({ requisito: 'vulkan', estado: 'cumple', exigido: '1.3', detectado: { valor: '1.3–1.4', origen: 'proyectado' } })
    })
    it('a range below the minimum misses it', () => {
      expect(vulkan(proyectado('1.2', '1.2'), minimo('1.3'))).toEqual({ requisito: 'vulkan', estado: 'no_cumple', exigido: '1.3', detectado: { valor: '1.2', origen: 'proyectado' } })
    })
    it('a range that straddles the minimum is unknown, never a false cumple', () => {
      expect(evaluar(proyectado('1.0', '1.1'), minimo('1.1'))).toMatchObject({ veredicto: 'informacion_insuficiente', comprobaciones: [{ estado: 'desconocido', detectado: { valor: '1.0–1.1', origen: 'proyectado' } }] })
    })
    it('projected support with no minimum version meets requiere_vulkan', () => {
      expect(vulkan(proyectado('1.0', '1.1'), { ...nada, requiere_vulkan: true })?.estado).toBe('cumple')
    })
    it('a family without Vulkan misses requiere_vulkan', () => {
      const sinVulkan: Capacidades = { ...equipo, vulkan: { soporte: 'no', origen: 'proyectado' } }
      expect(vulkan(sinVulkan, { ...nada, requiere_vulkan: true })).toEqual({ requisito: 'vulkan', estado: 'no_cumple', exigido: 'si', detectado: { valor: 'no', origen: 'proyectado' } })
    })
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

describe('condiciones', () => {
  it('parses the profile minimum version', () => {
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
