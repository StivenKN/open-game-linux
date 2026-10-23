import { describe, expect, it } from '@effect/vitest'
import { Result, Schema } from 'effect'
import { NewReport } from '../domain/contributions.ts'
import { User } from '../domain/tables.ts'
import { en } from './i18n/en.ts'
import { es } from './i18n/es.ts'
import { readForm } from './useAction.ts'

const report: Record<string, string> = {
  edition_id: '1',
  diagnostic_id: '2',
  'layer_version[_tag]': 'existente',
  'layer_version[id]': '3',
  profile_id: 'null',
  game_version: '  1.0.3  ',
  launcher_version: '',
  tested_at: '2026-10-01',
  outcome: 'no_inicia',
  'failures[0][failure_type_id]': '4',
  'failures[0][detail]': 'Pantalla negra al lanzar',
  measurement: 'null',
  observations: 'Probado dos veces',
}

const form = (changes: Record<string, string | null>) => {
  const data = new FormData()
  for (const [k, v] of Object.entries({ ...report, ...changes })) if (v !== null) data.append(k, v)
  return data
}

const errorsFor = (changes: Record<string, string | null>) => Result.match(readForm(NewReport, form(changes), es), {
  onSuccess: () => ({}),
  onFailure: (e) => e,
})

describe('readForm', () => {
  it('returns the encoded value the server validator expects', () => {
    const parsed = readForm(NewReport, form({}), es)
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
    expect(errorsFor({ observations: '   ' })).toEqual({ observations: 'Este campo es obligatorio.' })
  })

  it('a missing field is required', () => {
    expect(errorsFor({ profile_id: null })).toEqual({ profile_id: 'Este campo es obligatorio.' })
  })

  it('a nested error lands on the name of the input that produced it', () => {
    expect(errorsFor({ 'failures[0][detail]': '' })).toEqual({ 'failures[0][detail]': 'Este campo es obligatorio.' })
  })

  it('reports every invalid field at once, not only the first', () => {
    expect(errorsFor({ observations: '', game_version: '', profile_id: null })).toEqual({
      observations: 'Este campo es obligatorio.',
      game_version: 'Este campo es obligatorio.',
      profile_id: 'Este campo es obligatorio.',
    })
  })

  it('a text longer than its column states the limit', () => {
    const data = new FormData()
    data.append('alias', 'a'.repeat(61))
    const read = (t: typeof es) => Result.match(readForm(Schema.Struct({ alias: User.fields.alias }), data, t), { onSuccess: () => ({}), onFailure: (e) => e })
    expect(read(es)).toEqual({ alias: 'Usa como máximo 60 caracteres.' })
    expect(read(en)).toEqual({ alias: 'Use 60 characters at most.' })
  })

  it('a domain check says its code in the page language', () => {
    const data = new FormData()
    for (const [k, v] of Object.entries({ ...report, 'failures[0][detail]': '' })) data.append(k, v)
    expect(Result.match(readForm(NewReport, data, en), { onSuccess: () => ({}), onFailure: (e) => e })).toEqual({ 'failures[0][detail]': 'This field is required.' })
  })

  it('an unknown union member lands on the union name, in the page language', () => {
    expect(errorsFor({ 'layer_version[_tag]': 'inventada' })).toEqual({ layer_version: 'Revisa este valor.' })
  })

  it('an outcome outside the list shows no English type dump', () => {
    expect(errorsFor({ outcome: 'regular' })).toEqual({ form: 'Revisa este valor.' })
  })

  it('a malformed value gets the generic notice', () => {
    expect(errorsFor({ 'layer_version[id]': 'abc' })).toEqual({ 'layer_version[id]': 'Revisa este valor.' })
  })
})
