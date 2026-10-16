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

describe('leerFormulario', () => {
  it('entrega el valor codificado que espera el validador del servidor', () => {
    const parsed = readForm(NewReport, form({}))
    expect(Result.isSuccess(parsed) && parsed.success).toEqual({
      edicion_id: 1,
      diagnostico_id: 2,
      version_capa: { _tag: 'existente', id: 3 },
      perfil_id: null,
      version_juego: '1.0.3',
      version_lanzador: null,
      fecha_prueba: '2026-10-01T00:00:00.000Z',
      resultado: 'no_inicia',
      fallos: [{ tipo_fallo_id: 4, detalle: 'Pantalla negra al lanzar' }],
      medicion: null,
      observaciones: 'Probado dos veces',
    })
  })

  it('un texto obligatorio en blanco usa el mensaje de Texto', () => {
    expect(errorsFor({ observaciones: '   ' })).toEqual({ observaciones: 'Este campo es obligatorio.' })
  })

  it('un campo ausente es obligatorio', () => {
    expect(errorsFor({ perfil_id: null })).toEqual({ perfil_id: 'Este campo es obligatorio.' })
  })

  it('un error anidado cae en el nombre del input que lo produjo', () => {
    expect(errorsFor({ 'fallos[0][detalle]': '' })).toEqual({ 'fallos[0][detalle]': 'Este campo es obligatorio.' })
  })

  it('informa todos los campos con error a la vez, no solo el primero', () => {
    expect(errorsFor({ observaciones: '', version_juego: '', perfil_id: null })).toEqual({
      observaciones: 'Este campo es obligatorio.',
      version_juego: 'Este campo es obligatorio.',
      perfil_id: 'Este campo es obligatorio.',
    })
  })

  it('un texto más largo que su columna dice el límite', () => {
    const data = new FormData()
    data.append('alias', 'a'.repeat(61))
    const parsed = readForm(Schema.Struct({ alias: User.fields.alias }), data)
    expect(Result.isFailure(parsed) && parsed.failure).toEqual({ alias: 'Usa como máximo 60 caracteres.' })
  })

  it('una variante desconocida de una unión cae en el nombre de la unión, en español', () => {
    expect(errorsFor({ 'version_capa[_tag]': 'inventada' })).toEqual({ version_capa: 'Revisa este valor.' })
  })

  it('un resultado fuera de la lista no muestra el volcado de tipos en inglés', () => {
    expect(errorsFor({ resultado: 'regular' })).toEqual({ formulario: 'Revisa este valor.' })
  })

  it('un valor mal formado recibe el aviso genérico en español', () => {
    expect(errorsFor({ 'version_capa[id]': 'abc' })).toEqual({ 'version_capa[id]': 'Revisa este valor.' })
  })
})
