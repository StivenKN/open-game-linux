// The pure half of useAccion: a submitted form becomes either the server fn's Encoded input or a
// map of Spanish field errors keyed by input name. Uses the real report form schema.
import { describe, expect, it } from '@effect/vitest'
import { Result } from 'effect'
import { NuevoReporte } from '../dominio/aportes.ts'
import { leerFormulario } from './useAccion.ts'

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

  it('un valor mal formado recibe el aviso genérico en español', () => {
    expect(errores({ 'version_capa[id]': 'abc' })).toEqual({ 'version_capa[id]': 'Revisa este valor.' })
  })
})
