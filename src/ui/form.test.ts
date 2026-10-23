import { describe, expect, it } from '@effect/vitest'
import { Result, Schema } from 'effect'
import { NewGame, NewReport } from '../domain/contributions.ts'
import { Checkbox, OptionalNumber } from '../domain/ids.ts'
import { readForm } from './useAction.ts'

const formData = (pairs: Record<string, string>) => {
  const f = new FormData()
  for (const [k, v] of Object.entries(pairs)) f.append(k, v)
  return f
}

const Sample = Schema.Struct({ vram_mb: OptionalNumber(Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))), required: Checkbox })

describe('form conventions', () => {
  it('a blank number and an unticked checkbox arrive as null and false', () => {
    expect(readForm(Sample, formData({ vram_mb: '  ' }))).toEqual(Result.succeed({ vram_mb: '', required: false }))
    expect(Schema.decodeUnknownSync(Sample)({ vram_mb: '', required: false })).toEqual({ vram_mb: null, required: false })
  })

  it('a typed number and a ticked checkbox arrive with their value', () => {
    expect(readForm(Sample, formData({ vram_mb: '4096', required: 'true' }))).toEqual(Result.succeed({ vram_mb: '4096', required: true }))
    expect(Schema.decodeUnknownSync(Sample)({ vram_mb: '4096', required: true })).toEqual({ vram_mb: 4096, required: true })
  })

  it('apis[] checkboxes arrive as a list, even with one ticked', () => {
    const game = formData({ title: 'Hades', description: 'd', 'editions[0][launcher_id]': '1', 'editions[0][external_id]': '', x86_level_min: 'null', request_id: 'null' })
    const read = (...apis: ReadonlyArray<string>) => {
      const f = new FormData()
      for (const [k, v] of game) f.append(k, v)
      for (const api of apis) f.append('apis[]', api)
      return Result.map(readForm(NewGame, f), (j) => j.apis)
    }
    expect(read('d3d11')).toEqual(Result.succeed(['d3d11']))
    expect(read('d3d11', 'vulkan')).toEqual(Result.succeed(['d3d11', 'vulkan']))
    expect(read()).toEqual(Result.fail({ apis: 'Marca al menos una API gráfica.' }))
  })

  it('an invalid number is a field error, not a null', () => {
    expect(readForm(Sample, formData({ vram_mb: '-1' }))).toEqual(Result.fail({ vram_mb: 'Revisa este valor.' }))
  })
})

describe('column limits in the report', () => {
  const report = {
    edition_id: '1',
    diagnostic_id: '2',
    'layer_version[_tag]': 'nueva',
    'layer_version[family]': 'Proton',
    'layer_version[variant]': 'GE',
    'layer_version[version]': '9-20',
    profile_id: 'null',
    game_version: '1.0',
    launcher_version: '',
    tested_at: '2026-10-01T10:00',
    outcome: 'funciona',
    'measurement[avg_fps]': '60',
    'measurement[resolution]': '1920x1080',
    'measurement[graphics_quality]': 'Alta',
    'measurement[measurement_method]': 'MangoHud',
    observations: 'Sin problemas',
  }

  it('a text longer than its column is a field error, not a failed insert', () => {
    const tooLong = readForm(
      NewReport,
      formData({ ...report, game_version: 'v'.repeat(81), launcher_version: 'l'.repeat(81), 'measurement[resolution]': 'r'.repeat(31), 'layer_version[version]': 'x'.repeat(61) }),
    )
    expect(tooLong).toEqual(
      Result.fail({
        game_version: 'Usa como máximo 80 caracteres.',
        launcher_version: 'Usa como máximo 80 caracteres.',
        'measurement[resolution]': 'Usa como máximo 30 caracteres.',
        'layer_version[version]': 'Usa como máximo 60 caracteres.',
      }),
    )
  })

  it('an FPS average that does not fit numeric(7,2) states the range', () => {
    expect(readForm(NewReport, formData({ ...report, 'measurement[avg_fps]': '100000' }))).toEqual(
      Result.fail({ 'measurement[avg_fps]': 'Escribe un promedio de FPS entre 0 y 99999.99.' }),
    )
  })
})
