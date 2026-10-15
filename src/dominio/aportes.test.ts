import { describe, expect, it } from '@effect/vitest'
import { Result, Schema, SchemaIssue } from 'effect'
import { CapturaManual, type ContextoPrueba, discrepancias, NuevoReporte, type PerfilObjetivo } from './aportes.ts'
import { DistribucionId, EdicionId, VersionCapaId } from './ids.ts'

describe('discrepancias (8.7 comparability)', () => {
  const perfil: PerfilObjetivo = {
    edicion_id: EdicionId.make(1),
    version_capa_id: VersionCapaId.make(1),
    distribucion_id: DistribucionId.make(1),
    arquitectura: 'x86_64',
    version_juego_objetivo: null,
  }
  const prueba: ContextoPrueba = { ...perfil, version_juego: '1.0.3179' }

  it('a test in the profile environment is comparable', () => {
    expect(discrepancias(prueba, perfil)).toEqual([])
  })

  it.each([
    [{ ...prueba, edicion_id: EdicionId.make(2) }, { de: 'edicion', esperado: 1, observado: 2 }],
    [{ ...prueba, version_capa_id: VersionCapaId.make(3) }, { de: 'capa', esperado: 1, observado: 3 }],
    [{ ...prueba, distribucion_id: DistribucionId.make(4) }, { de: 'distribucion', esperado: 1, observado: 4 }],
    [{ ...prueba, arquitectura: 'aarch64' }, { de: 'arquitectura', esperado: 'x86_64', observado: 'aarch64' }],
  ])('names the mismatching side: %o', (otra, discrepancia) => {
    expect(discrepancias(otra, perfil)).toEqual([discrepancia])
  })

  it('checks the game version only when the profile limits it, as exact text', () => {
    const limitado = { ...perfil, version_juego_objetivo: '1.0.3179' }
    expect(discrepancias(prueba, limitado)).toEqual([])
    expect(discrepancias({ ...prueba, version_juego: '1.0.3179.0' }, limitado)).toEqual([
      { de: 'version_juego', esperado: '1.0.3179', observado: '1.0.3179.0' },
    ])
  })

  it('reports every mismatch, not only the first', () => {
    const otra = { ...prueba, distribucion_id: DistribucionId.make(2), arquitectura: 'aarch64' }
    expect(discrepancias(otra, perfil).map((d) => d.de)).toEqual(['distribucion', 'arquitectura'])
  })
})

const formulario = <S extends Schema.Top & { readonly DecodingServices: never }>(esquema: S) => {
  const decodificar = Schema.decodeUnknownResult(Schema.fromFormData(Schema.toCodecStringTree(esquema)))
  const formato = SchemaIssue.makeFormatterStandardSchemaV1()
  return (pares: Record<string, string>) => {
    const datos = new FormData()
    for (const [k, v] of Object.entries(pares)) datos.append(k, v)
    return Result.mapError(decodificar(datos), (e) =>
      formato(e.issue).issues.map((i) => [(i.path ?? []).map((p) => (typeof p === 'object' ? p.key : p)), i.message]),
    )
  }
}

describe('NuevoReporte from the report form', () => {
  const decodificar = formulario(NuevoReporte)
  const base = {
    edicion_id: '1',
    diagnostico_id: '2',
    'version_capa[_tag]': 'existente',
    'version_capa[id]': '3',
    perfil_id: 'null',
    version_juego: '1.0.3',
    version_lanzador: '',
    fecha_prueba: '2026-10-01',
    resultado: 'funciona',
    medicion: 'null',
    observaciones: 'Probado dos veces',
  }

  it('a working result with no fallos rows decodes with fallos []', () => {
    const r = decodificar(base)
    expect(Result.isSuccess(r) && r.success).toMatchObject({ resultado: 'funciona', fallos: [], perfil_id: null, version_lanzador: null })
  })

  it('a failing result with no fallos fails on the fallos field (8.7)', () => {
    expect(decodificar({ ...base, resultado: 'no_inicia' })).toEqual(
      Result.fail([[['fallos'], 'Si no inicia o falla, indica al menos un tipo de fallo (usa «otro» si no sabes la causa).']]),
    )
  })

  it('a failing result with a fallo decodes, and its fallos type is non-empty', () => {
    const r = decodificar({ ...base, resultado: 'falla_en_ejecucion', 'fallos[0][tipo_fallo_id]': '4', 'fallos[0][detalle]': 'Se cierra' })
    expect(Result.isSuccess(r) && r.success).toMatchObject({ fallos: [{ tipo_fallo_id: 4, detalle: 'Se cierra' }] })
  })

  it('perfil_id "null" is no profile, a number is a profile', () => {
    const sin = decodificar(base)
    const con = decodificar({ ...base, perfil_id: '7' })
    expect([Result.isSuccess(sin) && sin.success.perfil_id, Result.isSuccess(con) && con.success.perfil_id]).toEqual([null, 7])
  })

  it('required text is trimmed, and blank after trimming is rejected (8.9)', () => {
    const r = decodificar({ ...base, version_juego: '  1.0.3  ' })
    expect(Result.isSuccess(r) && r.success.version_juego).toBe('1.0.3')
    expect(decodificar({ ...base, version_juego: '   ' })).toEqual(Result.fail([[['version_juego'], 'Este campo es obligatorio.']]))
  })

  it('a new native layer version decodes (familia Nativo)', () => {
    const r = decodificar({ ...base, 'version_capa[_tag]': 'nueva', 'version_capa[familia]': 'Nativo', 'version_capa[variante]': 'Linux', 'version_capa[version]': '1.50' })
    expect(Result.isSuccess(r) && r.success.version_capa).toEqual({ _tag: 'nueva', familia: 'Nativo', variante: 'Linux', version: '1.50' })
  })
})

describe('CapturaManual from the manual form', () => {
  const decodificar = formulario(CapturaManual)
  const comun = {
    capturado_en: '2026-10-10T18:43:52Z',
    version_sistema: '10.0.19045',
    arquitectura: 'x86_64',
    cpu_modelo: 'Intel Core i5-1135G7',
    gpu_modelo: 'Intel Iris Xe',
    ram_mb: '16384',
    vram_mb: 'null',
  }
  const linux = {
    ...comun,
    sistema: 'Linux',
    'distribucion[nombre]': 'Ubuntu',
    'distribucion[version]': '24.04',
    controlador: '',
    version_controlador: '',
    soporte_vulkan: 'desconocido',
    version_vulkan: '',
  }

  it('a Windows capture has no distribution, Linux driver, Vulkan, PCI id or library', () => {
    const r = decodificar({ ...comun, sistema: 'Windows', soporte_vulkan: 'si', gpu_pci_id: '10de:1380' })
    expect(Result.isSuccess(r) && Object.keys(r.success).sort()).toEqual([...Object.keys(comun), 'sistema'].sort())
  })

  it('a Linux capture requires its distribution', () => {
    expect(Result.isFailure(decodificar({ ...comun, sistema: 'Linux', soporte_vulkan: 'desconocido' }))).toBe(true)
    const r = decodificar(linux)
    expect(Result.isSuccess(r) && r.success).toMatchObject({ sistema: 'Linux', distribucion: { nombre: 'Ubuntu', version: '24.04' }, controlador: null })
  })

  it('a Vulkan version without support si is rejected', () => {
    expect(Result.isFailure(decodificar({ ...linux, version_vulkan: '1.3' }))).toBe(true)
    expect(Result.isSuccess(decodificar({ ...linux, soporte_vulkan: 'si', version_vulkan: '1.3' }))).toBe(true)
  })
})
