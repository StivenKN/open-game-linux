// Spanish label, tone and icon for every domain literal the UI shows. `satisfies Record<Union, …>`:
// adding a literal to a dominio Schema without a label here fails `tsc`.
// Tone is never the only signal: every badge renders its icon and text next to the colour.
import type { EstadoCompatibilidad } from '../dominio/compatibilidad.ts'
import type { Resultado } from '../dominio/literales.ts'
import type { Comprobacion, Sistema, SoporteVulkan, VeredictoRequisitos } from '../dominio/evaluacion.ts'
import type { PayloadInvalido } from '../dominio/fallos.ts'
import type { Bloqueo, EstadoRevision } from '../dominio/revision.ts'
import type { TipoGuia } from '../dominio/guias.ts'

export type Tono = 'verde' | 'amarillo' | 'rojo' | 'gris' | 'morado' | 'azul'
export type Etiqueta = { readonly texto: string; readonly tono: Tono; readonly icono: string }

export const estadoCompatibilidad = {
  sin_evidencia: { texto: 'Sin evidencia verificada', tono: 'gris', icono: '?' },
  funciona: { texto: 'Funciona', tono: 'verde', icono: '✓' },
  funciona_con_ajustes: { texto: 'Funciona con ajustes', tono: 'amarillo', icono: '⚙' },
  no_inicia: { texto: 'No inicia', tono: 'rojo', icono: '✕' },
  falla_en_ejecucion: { texto: 'Falla en ejecución', tono: 'rojo', icono: '✕' },
  resultados_variables: { texto: 'Resultados variables', tono: 'morado', icono: '◐' },
} as const satisfies Record<EstadoCompatibilidad, Etiqueta>

export const resultado = {
  funciona: estadoCompatibilidad.funciona,
  funciona_con_ajustes: estadoCompatibilidad.funciona_con_ajustes,
  no_inicia: estadoCompatibilidad.no_inicia,
  falla_en_ejecucion: estadoCompatibilidad.falla_en_ejecucion,
} as const satisfies Record<Resultado, Etiqueta>

/** Dashed badge: hardware evaluation, never an FPS prediction. */
export const veredictoRequisitos = {
  no_cumple: { texto: 'No cumple', tono: 'rojo', icono: '✕' },
  informacion_insuficiente: { texto: 'Información insuficiente', tono: 'gris', icono: '?' },
  cumple: { texto: 'Cumple las condiciones conocidas', tono: 'verde', icono: '✓' },
} as const satisfies Record<VeredictoRequisitos, Etiqueta>

/** One row of the evaluation checklist. */
export const estadoComprobacion = {
  cumple: { texto: 'Cumple', tono: 'verde', icono: '✓' },
  no_cumple: { texto: 'No cumple', tono: 'rojo', icono: '✕' },
  desconocido: { texto: 'Desconocido', tono: 'amarillo', icono: '?' },
} as const satisfies Record<Comprobacion['estado'], Etiqueta>

export const requisito = { ram: 'RAM', vram: 'VRAM', vulkan: 'Vulkan' } as const satisfies Record<Comprobacion['requisito'], string>

export const soporteVulkan = {
  si: 'Compatible',
  no: 'Sin soporte',
  desconocido: 'Desconocido',
} as const satisfies Record<SoporteVulkan, string>

export const sistema = { Linux: 'Linux', Windows: 'Windows' } as const satisfies Record<Sistema, string>

export const estadoRevision = {
  pendiente: { texto: 'Pendiente de revisión', tono: 'gris', icono: '…' },
  aprobado: { texto: 'Aprobado', tono: 'verde', icono: '✓' },
  rechazado: { texto: 'Rechazado', tono: 'rojo', icono: '✕' },
  retirado: { texto: 'Retirado', tono: 'gris', icono: '–' },
} as const satisfies Record<EstadoRevision, Etiqueta>

export const bloqueo = {
  perfil_sin_reporte_funcional_aprobado: 'Falta un reporte aprobado que use este perfil con resultado funcional.',
  solucion_fallo_origen_no_aprobado: 'El reporte con el fallo de origen aún no está aprobado.',
  solucion_perfil_no_aprobado: 'El perfil que recomienda la solución aún no está aprobado.',
  reporte_incomparable: 'El perfil no coincide con el entorno del diagnóstico.',
} as const satisfies Record<Bloqueo, string>

/**
 * tipo_fallo.codigo is seeded data, not a Schema literal, so this table cannot be exhaustive.
 * Known codes get a label; anti-cheat and DRM read as blockers (red), the rest as causes (yellow).
 * An unknown code still renders, as its own text.
 */
type EtiquetaFallo = Omit<Etiqueta, 'icono'>
const tiposFallo: Readonly<Record<string, EtiquetaFallo>> = {
  anti_cheat: { texto: 'Anti-cheat', tono: 'rojo' },
  drm: { texto: 'DRM', tono: 'rojo' },
  lanzador: { texto: 'Lanzador', tono: 'amarillo' },
  controlador: { texto: 'Controlador', tono: 'amarillo' },
  dependencia: { texto: 'Dependencia', tono: 'amarillo' },
  rendimiento: { texto: 'Rendimiento', tono: 'amarillo' },
  otro: { texto: 'Otro', tono: 'amarillo' },
}

export const tipoFallo = (codigo: string): EtiquetaFallo => tiposFallo[codigo] ?? { texto: codigo.replaceAll('_', ' '), tono: 'amarillo' }

/** RF-09 guide kinds. */
export const tipoGuia = {
  eleccion_distribucion: 'Elegir distribución',
  instalacion: 'Instalación',
  arranque_dual: 'Arranque dual',
} as const satisfies Record<TipoGuia, string>

/** Why the server could not read a detector payload or pasted text (PayloadInvalido.motivo). */
export const motivoPayload = {
  ilegible: 'No pudimos leer ese texto. Copia toda la salida del detector, o la dirección completa que abrió tu navegador.',
  version_esquema: 'Ese diagnóstico viene de otra versión del detector. Descárgalo de nuevo y vuelve a ejecutarlo.',
  campo_invalido: 'Al diagnóstico le falta un dato o trae uno que no reconocemos.',
} as const satisfies Record<PayloadInvalido['motivo'], string>

/** The catalog's legend (wireframe 9.1): what each computed state means, in estadoDe's terms. */
export const significadoEstado = {
  sin_evidencia: 'Ningún revisor ha aprobado todavía una prueba de este juego.',
  funciona: 'Todas las pruebas aprobadas funcionan sin ajustes.',
  funciona_con_ajustes: 'Todas las pruebas aprobadas funcionan después de algún ajuste o perfil.',
  no_inicia: 'En todas las pruebas aprobadas el juego no llega a iniciar, por ejemplo por un anti-cheat a nivel de kernel.',
  falla_en_ejecucion: 'En todas las pruebas aprobadas el juego inicia, pero falla durante la partida.',
  resultados_variables: 'Las pruebas aprobadas dan resultados distintos. La ficha muestra cada entorno.',
} as const satisfies Record<EstadoCompatibilidad, string>
