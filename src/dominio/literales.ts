import { Schema } from 'effect'

export const FamiliaCapa = Schema.Literals(['Wine', 'Proton', 'Nativo'])
export type FamiliaCapa = typeof FamiliaCapa.Type

export const Resultado = Schema.Literals(['funciona', 'funciona_con_ajustes', 'no_inicia', 'falla_en_ejecucion'])
export type Resultado = typeof Resultado.Type

export const ResultadoFuncional = Resultado.pick(['funciona', 'funciona_con_ajustes'])
export type ResultadoFuncional = typeof ResultadoFuncional.Type

export const ResultadoFallido = Resultado.pick(['no_inicia', 'falla_en_ejecucion'])
export type ResultadoFallido = typeof ResultadoFallido.Type

export const exigeFallo = {
  funciona: false,
  funciona_con_ajustes: false,
  no_inicia: true,
  falla_en_ejecucion: true,
} as const satisfies Record<ResultadoFuncional, false> & Record<ResultadoFallido, true>

/** Graphics APIs a game can render with. A game with none declared has unknown APIs. */
export const ApiGrafica = Schema.Literals(['d3d9', 'd3d10', 'd3d11', 'd3d12', 'vulkan', 'opengl'])
export type ApiGrafica = typeof ApiGrafica.Type
