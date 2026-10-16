import { describe, expect, it } from '@effect/vitest'
import { Result, Schema } from 'effect'
import { NewReport } from '../domain/contributions.ts'
import { User } from '../domain/tables.ts'
import { readForm } from './useAction.ts'

const report: Record<string, string> = {
  edicion_id: '1',
  diagnostico_id: '2',
  'version_capa[_tag]': 'existente',
  'version_capa[id]': '3',
  perfil_id: 'null',
  version_juego: '  1.0.3  ',
  version_lanzador: '',
  fecha_prueba: '2026-10-01',
  resultado: 'no_inicia',
  'fallos[0][tipo_fallo_id]': '4',
  'fallos[0][detalle]': 'Pantalla negra al lanzar',
  medicion: 'null',
  observaciones: 'Probado dos veces',
}

const form = (changes: Record<string, string | null>) => {
  const data = new FormData()
  for (const [k, v] of Object.entries({ ...report, ...changes })) if (v !== null) data.append(k, v)
  return data
}

const errorsFor = (changes: Record<string, string | null>) => Result.match(readForm(NewReport, form(changes)), {
  onSuccess: () => ({}),
  onFailure: (e) => e,
})

describe('readForm', () => {
  it('returns the encoded value the server validator expects', () => {
    const parsed = readForm(NewReport, form({}))
    expect(Result.isSuccess(parsed) && parsed.success).toEqual({
      edition_id: 1,
      diagnostic_id: 2,
      layer_version: { _tag: 'existente', id: 3 },
      profile_id: null,
      game_version: '1.0.3',
      launcher_version: null,
      tested_at: '2026-10-01T00:00:00.000Z',
      outcome: 'no_inicia',
      failures: [{ failure_type_id: 4, detail: 'Pantalla negra al lanzar' }],
      measurement: null,
      observations: 'Probado dos veces',
    })
  })

  it('a blank required text gets the Text message', () => {
    expect(errorsFor({ observaciones: '   ' })).toEqual({ observaciones: 'Este campo es obligatorio.' })
  })

  it('a missing field is required', () => {
    expect(errorsFor({ perfil_id: null })).toEqual({ perfil_id: 'Este campo es obligatorio.' })
  })

  it('a nested error lands on the name of the input that produced it', () => {
    expect(errorsFor({ 'fallos[0][detalle]': '' })).toEqual({ 'fallos[0][detalle]': 'Este campo es obligatorio.' })
  })

  it('reports every invalid field at once, not only the first', () => {
    expect(errorsFor({ observaciones: '', version_juego: '', perfil_id: null })).toEqual({
      observaciones: 'Este campo es obligatorio.',
      version_juego: 'Este campo es obligatorio.',
      perfil_id: 'Este campo es obligatorio.',
    })
  })

  it('a text longer than its column states the limit', () => {
    const data = new FormData()
    data.append('alias', 'a'.repeat(61))
    const parsed = readForm(Schema.Struct({ alias: User.fields.alias }), data)
    expect(Result.isFailure(parsed) && parsed.failure).toEqual({ alias: 'Usa como máximo 60 caracteres.' })
  })

  it('an unknown union member lands on the union name, in Spanish', () => {
    expect(errorsFor({ 'version_capa[_tag]': 'inventada' })).toEqual({ version_capa: 'Revisa este valor.' })
  })

  it('an outcome outside the list shows no English type dump', () => {
    expect(errorsFor({ resultado: 'regular' })).toEqual({ formulario: 'Revisa este valor.' })
  })

  it('a malformed value gets the generic Spanish notice', () => {
    expect(errorsFor({ 'version_capa[id]': 'abc' })).toEqual({ 'version_capa[id]': 'Revisa este valor.' })
  })
})
