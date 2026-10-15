import { alMenos, type RangoVulkan, type VersionVulkan, versionVulkan, type VulkanEquipo } from '../../dominio/evaluacion.ts'
import { type AvisoGpu, type ControladorLinux, type EquipoEnLinux, FamiliaGpu, type PciId, type RutaD3d, type RutaLinux, VendorGpu } from '../../dominio/gpu.ts'
import type { Diagnostico } from '../../dominio/tablas.ts'
import { tablaGpu } from './familias.generado.ts'
import { decodificarTramos } from './tramos.ts'

/**
 * The diagnostico columns the projection reads: a stored row or a capture. Only a Linux one has driver and
 * Vulkan fields to read; a Windows row may still hold the Vulkan older versions stored, which is never read.
 */
export type ColumnasEquipo = Pick<Diagnostico, 'ram_mb' | 'vram_mb' | 'gpu_pci_id'> &
  ({ readonly sistema: 'Linux' } & Pick<Diagnostico, 'soporte_vulkan' | 'version_vulkan' | 'controlador'> | { readonly sistema: 'Windows' })

const v = (mayor: number, menor: number): VersionVulkan => ({ texto: `${mayor}.${menor}`, partes: [mayor, menor] })

type Politica = {
  readonly controlador: ControladorLinux
  readonly vulkan: RangoVulkan | null
  /** `salvo_con`: the warning is moot when the measured Linux kernel driver is already that one. */
  readonly avisos: ReadonlyArray<{ readonly aviso: AvisoGpu; readonly salvo_con: ControladorLinux | null }>
}

// Research of Oct 2026. A range marks a level nobody has read with vulkaninfo on real hardware yet.
const POLITICA = {
  intel_gen5_o_anterior: { controlador: 'i915', vulkan: null, avisos: [] },
  intel_gen6: { controlador: 'i915', vulkan: null, avisos: [] },
  intel_gen7: { controlador: 'i915', vulkan: null, avisos: [{ aviso: 'hasvk_incompleto', salvo_con: null }] },
  intel_gen7_5: { controlador: 'i915', vulkan: { desde: v(1, 0), hasta: v(1, 1) }, avisos: [{ aviso: 'vulkan_sin_verificar', salvo_con: null }] },
  intel_gen8: { controlador: 'i915', vulkan: { desde: v(1, 1), hasta: v(1, 2) }, avisos: [{ aviso: 'vulkan_sin_verificar', salvo_con: null }] },
  intel_gen9_o_posterior: { controlador: 'i915', vulkan: { desde: v(1, 3), hasta: v(1, 4) }, avisos: [] },
  amd_terascale_o_anterior: { controlador: 'radeon', vulkan: null, avisos: [] },
  amd_gcn1: { controlador: 'amdgpu', vulkan: { desde: v(1, 3), hasta: v(1, 4) }, avisos: [{ aviso: 'gcn_usar_amdgpu', salvo_con: 'amdgpu' }] },
  amd_gcn2: { controlador: 'amdgpu', vulkan: { desde: v(1, 3), hasta: v(1, 4) }, avisos: [{ aviso: 'gcn_usar_amdgpu', salvo_con: 'amdgpu' }] },
  amd_gcn3_o_posterior: { controlador: 'amdgpu', vulkan: { desde: v(1, 3), hasta: v(1, 4) }, avisos: [] },
  nvidia_tesla_o_anterior: { controlador: 'nouveau', vulkan: null, avisos: [{ aviso: 'nvidia_sin_controlador', salvo_con: null }] },
  nvidia_fermi: { controlador: 'nouveau', vulkan: null, avisos: [{ aviso: 'nvidia_sin_controlador', salvo_con: null }] },
  nvidia_kepler: { controlador: 'nouveau', vulkan: { desde: v(1, 2), hasta: v(1, 2) }, avisos: [{ aviso: 'kepler_470_fin', salvo_con: null }] },
  nvidia_maxwell_a_volta: { controlador: 'nvidia_580xx', vulkan: { desde: v(1, 4), hasta: v(1, 4) }, avisos: [{ aviso: 'fijar_nvidia_580xx', salvo_con: null }] },
  nvidia_turing_o_posterior: { controlador: 'nvidia', vulkan: { desde: v(1, 4), hasta: v(1, 4) }, avisos: [] },
} as const satisfies Record<FamiliaGpu, Politica>

const ids: Record<VendorGpu, Partial<Record<FamiliaGpu, string>>> = tablaGpu.ids

const familiaPorId: ReadonlyMap<string, FamiliaGpu> = new Map(
  VendorGpu.literals.flatMap((vendor) =>
    FamiliaGpu.literals.flatMap((familia) =>
      decodificarTramos(ids[vendor][familia] ?? '').map((device): [string, FamiliaGpu] => [`${vendor}:${device.toString(16).padStart(4, '0')}`, familia]),
    ),
  ),
)

const identificar = (pci: PciId | null): { readonly familia: FamiliaGpu; readonly politica: Politica } | null => {
  const familia = pci === null ? undefined : familiaPorId.get(pci)
  return familia === undefined ? null : { familia, politica: POLITICA[familia] }
}

/** Measured Linux Vulkan wins; otherwise the family projects it. A Windows row's stored Vulkan is never used. */
const vulkanEnLinux = (c: ColumnasEquipo, politica: Politica | null): VulkanEquipo => {
  if (c.sistema === 'Linux' && c.soporte_vulkan === 'si') {
    const version = versionVulkan(c.version_vulkan)
    return { soporte: 'si', origen: 'medido', rango: version === null ? null : { desde: version, hasta: version } }
  }
  if (c.sistema === 'Linux' && c.soporte_vulkan === 'no') return { soporte: 'no', origen: 'medido' }
  if (politica === null) return { soporte: 'desconocido' }
  return politica.vulkan === null ? { soporte: 'no', origen: 'proyectado' } : { soporte: 'si', origen: 'proyectado', rango: politica.vulkan }
}

const rutas: ReadonlyArray<readonly [VersionVulkan, RutaD3d]> = [
  [v(1, 4), 'dxvk'],
  [v(1, 3), 'dxvk_2'],
  [v(1, 1), 'dxvk_sarek'],
]

/** The path for the range's floor: a projected range is only sure to reach its lower end. */
const rutaDe = (vulkan: VulkanEquipo): RutaLinux | null => {
  if (vulkan.soporte === 'no') return { d3d9_11: 'wined3d', d3d12: false }
  const piso = vulkan.soporte === 'si' ? vulkan.rango?.desde : undefined
  if (piso === undefined) return null
  return { d3d9_11: rutas.find(([minimo]) => alMenos(piso, minimo))?.[1] ?? 'wined3d', d3d12: alMenos(piso, v(1, 3)) }
}

const avisosDe = (c: ColumnasEquipo, politica: Politica, vulkan: VulkanEquipo): ReadonlyArray<AvisoGpu> => {
  const medidoEnLinux = c.sistema === 'Linux' ? c.controlador : null
  const faltaVulkan = vulkan.soporte === 'no' && vulkan.origen === 'medido' && politica.vulkan !== null
  return [
    ...politica.avisos.filter((a) => a.salvo_con === null || a.salvo_con !== medidoEnLinux).map((a) => a.aviso),
    ...(faltaVulkan ? (['vulkan_no_detectado'] as const) : []),
  ]
}

/** The one way to build what `evaluar` consumes from a stored or unsaved capture. */
export const equipoEnLinux = (c: ColumnasEquipo): EquipoEnLinux => {
  const gpu = identificar(c.gpu_pci_id)
  const vulkan = vulkanEnLinux(c, gpu?.politica ?? null)
  return {
    sistema: c.sistema,
    ram_mb: c.ram_mb,
    vram_mb: c.vram_mb,
    vulkan,
    gpu:
      gpu === null ? null : { familia: gpu.familia, controlador: gpu.politica.controlador, avisos: avisosDe(c, gpu.politica, vulkan) },
    ruta: rutaDe(vulkan),
  }
}
