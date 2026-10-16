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

const Sample = Schema.Struct({ vram_mb: OptionalNumber(Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))), obligatoria: Checkbox })

describe('convenciones de formulario', () => {
  it('un número en blanco y una casilla sin marcar llegan como null y false', () => {
    expect(readForm(Sample, formData({ vram_mb: '  ' }))).toEqual(Result.succeed({ vram_mb: '', obligatoria: false }))
    expect(Schema.decodeUnknownSync(Sample)({ vram_mb: '', obligatoria: false })).toEqual({ vram_mb: null, obligatoria: false })
  })

  it('un número escrito y una casilla marcada llegan con su valor', () => {
    expect(readForm(Sample, formData({ vram_mb: '4096', obligatoria: 'true' }))).toEqual(Result.succeed({ vram_mb: '4096', obligatoria: true }))
    expect(Schema.decodeUnknownSync(Sample)({ vram_mb: '4096', obligatoria: true })).toEqual({ vram_mb: 4096, obligatoria: true })
  })

  it('las casillas apis[] llegan como lista, también con una sola marcada', () => {
    const game = formData({ titulo: 'Hades', descripcion: 'd', 'ediciones[0][lanzador_id]': '1', 'ediciones[0][identificador_externo]': '', nivel_x86_min: 'null' })
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

  it('un número inválido es un error del campo, no un null', () => {
    expect(readForm(Sample, formData({ vram_mb: '-1' }))).toEqual(Result.fail({ vram_mb: 'Revisa este valor.' }))
  })
})

describe('límites de columna en el reporte', () => {
  const report = {
    edicion_id: '1',
    diagnostico_id: '2',
    'version_capa[_tag]': 'nueva',
    'version_capa[familia]': 'Proton',
    'version_capa[variante]': 'GE',
    'version_capa[version]': '9-20',
    perfil_id: 'null',
    version_juego: '1.0',
    version_lanzador: '',
    fecha_prueba: '2026-10-01T10:00',
    resultado: 'funciona',
    'medicion[fps_promedio]': '60',
    'medicion[resolucion]': '1920x1080',
    'medicion[calidad_grafica]': 'Alta',
    'medicion[metodo_medicion]': 'MangoHud',
    observaciones: 'Sin problemas',
  }

  it('un texto más largo que su columna es un error del campo, no un fallo del insert', () => {
    const tooLong = readForm(
      NewReport,
      formData({ ...report, version_juego: 'v'.repeat(81), version_lanzador: 'l'.repeat(81), 'medicion[resolucion]': 'r'.repeat(31), 'version_capa[version]': 'x'.repeat(61) }),
    )
    expect(tooLong).toEqual(
      Result.fail({
        version_juego: 'Usa como máximo 80 caracteres.',
        version_lanzador: 'Usa como máximo 80 caracteres.',
        'medicion[resolucion]': 'Usa como máximo 30 caracteres.',
        'version_capa[version]': 'Usa como máximo 60 caracteres.',
      }),
    )
  })

  it('un promedio de FPS que no cabe en numeric(7,2) dice el rango', () => {
    expect(readForm(NewReport, formData({ ...report, 'medicion[fps_promedio]': '100000' }))).toEqual(
      Result.fail({ 'medicion[fps_promedio]': 'Escribe un promedio de FPS entre 0 y 99999.99.' }),
    )
  })
})
