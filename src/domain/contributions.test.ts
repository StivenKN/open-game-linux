import { describe, expect, it } from '@effect/vitest'
import { Result, Schema, SchemaIssue } from 'effect'
import { ManualCapture, type TestContext, mismatches, NewReport, type TargetProfile } from './contributions.ts'
import { DistributionId, EditionId, LayerVersionId } from './ids.ts'

describe('mismatches (8.7 comparability)', () => {
  const profile: TargetProfile = {
    edition_id: EditionId.make(1),
    layer_version_id: LayerVersionId.make(1),
    distribution_id: DistributionId.make(1),
    architecture: 'x86_64',
    target_game_version: null,
  }
  const context: TestContext = { ...profile, game_version: '1.0.3179' }

  it('a test in the profile environment is comparable', () => {
    expect(mismatches(context, profile)).toEqual([])
  })

  it.each([
    [{ ...context, edition_id: EditionId.make(2) }, { aspect: 'edicion', expected: 1, actual: 2 }],
    [{ ...context, layer_version_id: LayerVersionId.make(3) }, { aspect: 'capa', expected: 1, actual: 3 }],
    [{ ...context, distribution_id: DistributionId.make(4) }, { aspect: 'distribucion', expected: 1, actual: 4 }],
    [{ ...context, architecture: 'aarch64' }, { aspect: 'arquitectura', expected: 'x86_64', actual: 'aarch64' }],
  ])('names the mismatching side: %o', (other, mismatch) => {
    expect(mismatches(other, profile)).toEqual([mismatch])
  })

  it('checks the game version only when the profile limits it, as exact text', () => {
    const pinned = { ...profile, target_game_version: '1.0.3179' }
    expect(mismatches(context, pinned)).toEqual([])
    expect(mismatches({ ...context, game_version: '1.0.3179.0' }, pinned)).toEqual([
      { aspect: 'version_juego', expected: '1.0.3179', actual: '1.0.3179.0' },
    ])
  })

  it('reports every mismatch, not only the first', () => {
    const other = { ...context, distribution_id: DistributionId.make(2), architecture: 'aarch64' }
    expect(mismatches(other, profile).map((d) => d.aspect)).toEqual(['distribucion', 'arquitectura'])
  })
})

const fromForm = <S extends Schema.Top & { readonly DecodingServices: never }>(schema: S) => {
  const decode = Schema.decodeUnknownResult(Schema.fromFormData(Schema.toCodecStringTree(schema)))
  const format = SchemaIssue.makeFormatterStandardSchemaV1()
  return (pairs: Record<string, string>) => {
    const data = new FormData()
    for (const [k, v] of Object.entries(pairs)) data.append(k, v)
    return Result.mapError(decode(data), (e) =>
      format(e.issue).issues.map((i) => [(i.path ?? []).map((p) => (typeof p === 'object' ? p.key : p)), i.message]),
    )
  }
}

describe('NewReport from the report form', () => {
  const decode = fromForm(NewReport)
  const base = {
    edition_id: '1',
    diagnostic_id: '2',
    'layer_version[_tag]': 'existente',
    'layer_version[id]': '3',
    profile_id: 'null',
    game_version: '1.0.3',
    launcher_version: '',
    tested_at: '2026-10-01',
    outcome: 'funciona',
    measurement: 'null',
    observations: 'Probado dos veces',
  }

  it('a working result with no failure rows decodes with failures []', () => {
    const r = decode(base)
    expect(Result.isSuccess(r) && r.success).toMatchObject({ outcome: 'funciona', failures: [], profile_id: null, launcher_version: null })
  })

  it('a failing result with no failures fails on the failures field (8.7)', () => {
    expect(decode({ ...base, outcome: 'no_inicia' })).toEqual(
      Result.fail([[['failures'], 'failureNeeded']]),
    )
  })

  it('a failing result with a failure decodes, and its failures type is non-empty', () => {
    const r = decode({ ...base, outcome: 'falla_en_ejecucion', 'failures[0][failure_type_id]': '4', 'failures[0][detail]': 'Se cierra' })
    expect(Result.isSuccess(r) && r.success).toMatchObject({ failures: [{ failure_type_id: 4, detail: 'Se cierra' }] })
  })

  it('profile_id "null" is no profile, a number is a profile', () => {
    const withoutProfile = decode(base)
    const withProfile = decode({ ...base, profile_id: '7' })
    expect([Result.isSuccess(withoutProfile) && withoutProfile.success.profile_id, Result.isSuccess(withProfile) && withProfile.success.profile_id]).toEqual([null, 7])
  })

  it('required text is trimmed, and blank after trimming is rejected (8.9)', () => {
    const r = decode({ ...base, game_version: '  1.0.3  ' })
    expect(Result.isSuccess(r) && r.success.game_version).toBe('1.0.3')
    expect(decode({ ...base, game_version: '   ' })).toEqual(Result.fail([[['game_version'], 'required']]))
  })

  it('a new native layer version decodes (family Nativo)', () => {
    const r = decode({ ...base, 'layer_version[_tag]': 'nueva', 'layer_version[family]': 'Nativo', 'layer_version[variant]': 'Linux', 'layer_version[version]': '1.50' })
    expect(Result.isSuccess(r) && r.success.layer_version).toEqual({ _tag: 'nueva', family: 'Nativo', variant: 'Linux', version: '1.50' })
  })
})

describe('ManualCapture from the manual form', () => {
  const decode = fromForm(ManualCapture)
  const common = {
    capturado_en: '2026-10-10T18:43:52Z',
    version_sistema: '10.0.19045',
    arquitectura: 'x86_64',
    cpu_modelo: 'Intel Core i5-1135G7',
    gpu_modelo: 'Intel Iris Xe',
    ram_mb: '16384',
    vram_mb: 'null',
    dispositivo: 'null',
  }
  const linux = {
    ...common,
    sistema: 'Linux',
    'distribucion[nombre]': 'Ubuntu',
    'distribucion[version]': '24.04',
    controlador: '',
    version_controlador: '',
    soporte_vulkan: 'desconocido',
    version_vulkan: '',
  }

  it('a Windows capture has no distribution, Linux driver, Vulkan, PCI id or library', () => {
    const r = decode({ ...common, sistema: 'Windows', soporte_vulkan: 'si', gpu_pci_id: '10de:1380' })
    expect(Result.isSuccess(r) && Object.keys(r.success).sort()).toEqual([...Object.keys(common), 'sistema'].sort())
  })

  it('a Linux capture requires its distribution', () => {
    expect(Result.isFailure(decode({ ...common, sistema: 'Linux', soporte_vulkan: 'desconocido' }))).toBe(true)
    const r = decode(linux)
    expect(Result.isSuccess(r) && r.success).toMatchObject({ sistema: 'Linux', distribucion: { nombre: 'Ubuntu', version: '24.04' }, controlador: null })
  })

  it('says which Steam Deck it is, and nothing else', () => {
    const r = decode({ ...linux, dispositivo: 'steam_deck_oled' })
    expect(Result.isSuccess(r) && r.success).toMatchObject({ dispositivo: 'steam_deck_oled' })
    expect(Result.isFailure(decode({ ...linux, dispositivo: 'rog_ally' }))).toBe(true)
  })

  it('a Vulkan version without support si is rejected', () => {
    expect(Result.isFailure(decode({ ...linux, version_vulkan: '1.3' }))).toBe(true)
    expect(Result.isSuccess(decode({ ...linux, soporte_vulkan: 'si', version_vulkan: '1.3' }))).toBe(true)
  })
})
