// Literal sets that both the row schemas (tablas.ts) and the input schemas (aportes.ts) need.
// Imports only effect, so aportes.ts can spread tablas.ts fields without an import cycle.
import { Schema } from 'effect'

/** version_capa.familia. 'Nativo' is round 1 open decision 2's default (native Linux titles). */
export const FamiliaCapa = Schema.Literals(['Wine', 'Proton', 'Nativo'])
export type FamiliaCapa = typeof FamiliaCapa.Type

/** reporte.resultado. The DB CHECK is generated from `Resultado.literals` (servidor/esquema). */
export const Resultado = Schema.Literals(['funciona', 'funciona_con_ajustes', 'no_inicia', 'falla_en_ejecucion'])
export type Resultado = typeof Resultado.Type

/** 8.9's "resultado funcional": what a profile's approval needs from at least one approved report. */
export const ResultadoFuncional = Resultado.pick(['funciona', 'funciona_con_ajustes'])
export type ResultadoFuncional = typeof ResultadoFuncional.Type

/** 8.7: these results need >= 1 reporte_fallo. NuevoReporte gives them a non-empty `fallos` type. */
export const ResultadoFallido = Resultado.pick(['no_inicia', 'falla_en_ejecucion'])
export type ResultadoFallido = typeof ResultadoFallido.Type

/** 8.7 as a lookup. `satisfies` ties it to ResultadoFuncional and ResultadoFallido at compile time. */
export const exigeFallo = {
  funciona: false,
  funciona_con_ajustes: false,
  no_inicia: true,
  falla_en_ejecucion: true,
} as const satisfies Record<ResultadoFuncional, false> & Record<ResultadoFallido, true>
