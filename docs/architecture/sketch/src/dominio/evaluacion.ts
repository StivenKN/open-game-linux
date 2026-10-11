// 8.10 "Diagnóstico previo a la ejecución". Pure and isomorphic. Computed per request, never stored.
// There is deliberately no field anywhere in this file that could hold an FPS number.
import { Schema } from 'effect'

export const Sistema = Schema.Literals(['Linux', 'Windows'])
export type Sistema = typeof Sistema.Type

export const SoporteVulkan = Schema.Literals(['si', 'no', 'desconocido'])
export type SoporteVulkan = typeof SoporteVulkan.Type

/** A Vulkan API version, compared per component (1.10 > 1.9), never as a decimal. */
export type VersionVulkan = { readonly texto: string; readonly partes: readonly [number, ...number[]] }

/** Null for anything that is not dot-separated integers. */
export const versionVulkan = (texto: string | null): VersionVulkan | null => {
  void texto
  throw new Error('not implemented')
}

/** Component-wise; a missing component counts as 0, so 1.3 satisfies a minimum of 1.3.0. */
export const alMenos = (v: VersionVulkan, minimo: VersionVulkan): boolean => {
  void v
  void minimo
  throw new Error('not implemented')
}

/**
 * A version exists only with support `si`. The detector reports an ICD ceiling version next to
 * `desconocido`; detector decision 2 drops it, and this type cannot carry it.
 * Mirrors CHECK diagnostico_version_vulkan_solo_con_soporte.
 */
export type Vulkan =
  | { readonly soporte: 'si'; readonly version: VersionVulkan | null }
  | { readonly soporte: 'no' }
  | { readonly soporte: 'desconocido' }

/** The slice of a diagnosis that 8.10 compares. */
export type Capacidades = {
  readonly sistema: Sistema
  readonly ram_mb: number // installed RAM (detector reads sysfs memory blocks; FINDINGS follow-up)
  readonly vram_mb: number | null
  readonly vulkan: Vulkan
}

/** Known conditions of an APPROVED profile. null = not a known condition. */
export type CondicionesConocidas = {
  readonly ram_min_mb: number | null
  readonly vram_min_mb: number | null
  readonly requiere_vulkan: boolean | null
  readonly version_vulkan_min: VersionVulkan | null
}

export const VeredictoRequisitos = Schema.Literals(['no_cumple', 'informacion_insuficiente', 'cumple'])
export type VeredictoRequisitos = typeof VeredictoRequisitos.Type

export type Comprobacion = {
  readonly requisito: 'ram' | 'vram' | 'vulkan'
  readonly estado: 'cumple' | 'no_cumple' | 'desconocido'
  readonly exigido: string // "8192" (MB) or "1.3"; the UI owns units and wording
  readonly detectado: string | null
}

export type Evaluacion = {
  readonly veredicto: VeredictoRequisitos
  readonly comprobaciones: ReadonlyArray<Comprobacion> // one per condition the profile states
  readonly solo_orientativa: boolean // Windows capture: orientation, not proof (8.10)
}

/**
 * Per stated condition:
 *   RAM    ram_min_mb set:   ram_mb >= min ? cumple : no_cumple            (exact, no tolerance factor)
 *   VRAM   vram_min_mb set:  vram_mb null ? desconocido : (>= min ? cumple : no_cumple)
 *   Vulkan requiere_vulkan === true:
 *            no -> no_cumple; desconocido -> desconocido;
 *            si: min null -> cumple; version null -> desconocido; else alMenos ? cumple : no_cumple
 * Veredicto: any no_cumple -> no_cumple; else any desconocido -> informacion_insuficiente;
 *            else zero comprobaciones -> informacion_insuficiente (a vacuous "cumple" misleads); else cumple.
 */
export const evaluar = (equipo: Capacidades, perfil: CondicionesConocidas): Evaluacion => {
  void equipo
  void perfil
  throw new Error('not implemented')
}

/**
 * Column-shaped capacities: a diagnostico row and a Captura share these names, so one function
 * serves the saved diagnosis and the guest's unsaved one.
 */
export type ColumnasCapacidad = {
  readonly sistema: Sistema
  readonly ram_mb: number
  readonly vram_mb: number | null
  readonly soporte_vulkan: SoporteVulkan
  readonly version_vulkan: string | null
}

export const capacidades = (c: ColumnasCapacidad): Capacidades => ({
  sistema: c.sistema,
  ram_mb: c.ram_mb,
  vram_mb: c.vram_mb,
  vulkan:
    c.soporte_vulkan === 'si'
      ? { soporte: 'si', version: versionVulkan(c.version_vulkan) }
      : { soporte: c.soporte_vulkan },
})

export type ColumnasCondicion = {
  readonly ram_min_mb: number | null
  readonly vram_min_mb: number | null
  readonly requiere_vulkan: boolean | null
  readonly version_vulkan_min: string | null
}

export const condiciones = (p: ColumnasCondicion): CondicionesConocidas => ({
  ram_min_mb: p.ram_min_mb,
  vram_min_mb: p.vram_min_mb,
  requiere_vulkan: p.requiere_vulkan,
  version_vulkan_min: versionVulkan(p.version_vulkan_min),
})

/**
 * Pure ranking for "perfil sugerido", approved profiles only: same distribucion + arquitectura as
 * the diagnosis first, then cumple > informacion_insuficiente > no_cumple, then highest revision.
 */
export const sugerirPerfil = <P extends { readonly distribucion_id: number; readonly arquitectura: string; readonly revision: number; readonly evaluacion: Evaluacion | null }>(
  perfiles: ReadonlyArray<P>,
  diagnostico: { readonly distribucion_id: number | null; readonly arquitectura: string },
): P | null => {
  void perfiles
  void diagnostico
  throw new Error('not implemented')
}
