import { describe, expect, it } from '@effect/vitest'
import { Result, Schema } from 'effect'
import { NuevoReporte } from '../domain/contributions.ts'
import { Usuario } from '../domain/tables.ts'
import { leerFormulario } from './useAction.ts'

const reporte: Record<string, string> = {
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

const formulario = (cambios: Record<string, string | null>) => {
  const datos = new FormData()
  for (const [k, v] of Object.entries({ ...reporte, ...cambios })) if (v !== null) datos.append(k, v)
  return datos
}

const errores = (cambios: Record<string, string | null>) => Result.match(leerFormulario(NuevoReporte, formulario(cambios)), {
  onSuccess: () => ({}),
  onFailure: (e) => e,
})

describe('leerFormulario', () => {
  it('entrega el valor codificado que espera el validador del servidor', () => {
    const leido = leerFormulario(NuevoReporte, formulario({}))
    expect(Result.isSuccess(leido) && leido.success).toEqual({
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
    expect(errores({ observaciones: '   ' })).toEqual({ observaciones: 'Este campo es obligatorio.' })
  })

  it('un campo ausente es obligatorio', () => {
    expect(errores({ perfil_id: null })).toEqual({ perfil_id: 'Este campo es obligatorio.' })
  })

  it('un error anidado cae en el nombre del input que lo produjo', () => {
    expect(errores({ 'fallos[0][detalle]': '' })).toEqual({ 'fallos[0][detalle]': 'Este campo es obligatorio.' })
  })

  it('informa todos los campos con error a la vez, no solo el primero', () => {
    expect(errores({ observaciones: '', version_juego: '', perfil_id: null })).toEqual({
      observaciones: 'Este campo es obligatorio.',
      version_juego: 'Este campo es obligatorio.',
      perfil_id: 'Este campo es obligatorio.',
    })
  })

  it('un texto más largo que su columna dice el límite', () => {
    const datos = new FormData()
    datos.append('alias', 'a'.repeat(61))
    const leido = leerFormulario(Schema.Struct({ alias: Usuario.fields.alias }), datos)
    expect(Result.isFailure(leido) && leido.failure).toEqual({ alias: 'Usa como máximo 60 caracteres.' })
  })

  it('una variante desconocida de una unión cae en el nombre de la unión, en español', () => {
    expect(errores({ 'version_capa[_tag]': 'inventada' })).toEqual({ version_capa: 'Revisa este valor.' })
  })

  it('un resultado fuera de la lista no muestra el volcado de tipos en inglés', () => {
    expect(errores({ resultado: 'regular' })).toEqual({ formulario: 'Revisa este valor.' })
  })

  it('un valor mal formado recibe el aviso genérico en español', () => {
    expect(errores({ 'version_capa[id]': 'abc' })).toEqual({ 'version_capa[id]': 'Revisa este valor.' })
  })
})
