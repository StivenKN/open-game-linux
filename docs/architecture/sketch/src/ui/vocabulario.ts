// Spanish label and tone for every domain literal the UI shows. `satisfies Record<Union, …>`:
// adding a literal to a dominio Schema without a label here fails `tsc`.
import type { EstadoCompatibilidad, Resultado } from '../dominio/compatibilidad.ts'
import type { VeredictoRequisitos } from '../dominio/evaluacion.ts'
import type { Bloqueo, EstadoRevision } from '../dominio/revision.ts'

export type Tono = 'verde' | 'amarillo' | 'rojo' | 'gris' | 'morado'
type Etiqueta = { readonly texto: string; readonly tono: Tono }

export const estadoCompatibilidad = {
  sin_evidencia: { texto: 'Sin evidencia verificada', tono: 'gris' },
  funciona: { texto: 'Funciona', tono: 'verde' },
  funciona_con_ajustes: { texto: 'Funciona con ajustes', tono: 'amarillo' },
  no_inicia: { texto: 'No inicia', tono: 'rojo' },
  falla_en_ejecucion: { texto: 'Falla en ejecución', tono: 'rojo' },
  resultados_variables: { texto: 'Resultados variables', tono: 'morado' },
} as const satisfies Record<EstadoCompatibilidad, Etiqueta>

export const resultado = {
  funciona: estadoCompatibilidad.funciona,
  funciona_con_ajustes: estadoCompatibilidad.funciona_con_ajustes,
  no_inicia: estadoCompatibilidad.no_inicia,
  falla_en_ejecucion: estadoCompatibilidad.falla_en_ejecucion,
} as const satisfies Record<Resultado, Etiqueta>

/** Dashed badge: hardware evaluation, never an FPS prediction. */
export const veredictoRequisitos = {
  no_cumple: { texto: 'No cumple', tono: 'rojo' },
  informacion_insuficiente: { texto: 'Información insuficiente', tono: 'gris' },
  cumple: { texto: 'Cumple las condiciones conocidas', tono: 'verde' },
} as const satisfies Record<VeredictoRequisitos, Etiqueta>

export const estadoRevision = {
  pendiente: 'Pendiente de revisión',
  aprobado: 'Aprobado',
  rechazado: 'Rechazado',
  retirado: 'Retirado',
} as const satisfies Record<EstadoRevision, string>

export const bloqueo = {
  perfil_sin_reporte_funcional_aprobado: 'Falta un reporte aprobado que use este perfil con resultado funcional.',
  solucion_fallo_origen_no_aprobado: 'El reporte con el fallo de origen aún no está aprobado.',
  solucion_perfil_no_aprobado: 'El perfil que recomienda la solución aún no está aprobado.',
  reporte_incomparable: 'El perfil no coincide con el entorno del diagnóstico.',
} as const satisfies Record<Bloqueo, string>
