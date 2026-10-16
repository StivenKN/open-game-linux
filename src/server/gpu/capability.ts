import { atLeast, type VulkanRange, type VulkanVersion, vulkanVersion, type MachineVulkan } from '../../domain/evaluation.ts'
import { type GpuWarning, type LinuxDriver, type MachineOnLinux, GpuFamily, type PciId, type D3dPath, type LinuxPaths, GpuVendor } from '../../domain/gpu.ts'
import type { Diagnostic } from '../../domain/tables.ts'
import { tablaGpu } from './families.generated.ts'
import { decodificarTramos } from './ranges.ts'

export type ColumnasEquipo = Pick<Diagnostic, 'ram_mb' | 'vram_mb' | 'gpu_pci_id'> &
  ({ readonly sistema: 'Linux' } & Pick<Diagnostic, 'soporte_vulkan' | 'version_vulkan' | 'controlador'> | { readonly sistema: 'Windows' })

const v = (mayor: number, menor: number): VulkanVersion => ({ text: `${mayor}.${menor}`, parts: [mayor, menor] })

type Politica = {
  readonly controlador: LinuxDriver
  readonly vulkan: VulkanRange | null
  readonly avisos: ReadonlyArray<{ readonly aviso: GpuWarning; readonly salvo_con: LinuxDriver | null }>
}

const POLITICA = {
  intel_gen5_o_anterior: { controlador: 'i915', vulkan: null, avisos: [] },
  intel_gen6: { controlador: 'i915', vulkan: null, avisos: [] },
  intel_gen7: { controlador: 'i915', vulkan: null, avisos: [{ aviso: 'hasvk_incompleto', salvo_con: null }] },
  intel_gen7_5: { controlador: 'i915', vulkan: { from: v(1, 0), to: v(1, 1) }, avisos: [{ aviso: 'vulkan_sin_verificar', salvo_con: null }] },
  intel_gen8: { controlador: 'i915', vulkan: { from: v(1, 1), to: v(1, 2) }, avisos: [{ aviso: 'vulkan_sin_verificar', salvo_con: null }] },
  intel_gen9_o_posterior: { controlador: 'i915', vulkan: { from: v(1, 3), to: v(1, 4) }, avisos: [] },
  amd_terascale_o_anterior: { controlador: 'radeon', vulkan: null, avisos: [] },
  amd_gcn1: { controlador: 'amdgpu', vulkan: { from: v(1, 3), to: v(1, 4) }, avisos: [{ aviso: 'gcn_usar_amdgpu', salvo_con: 'amdgpu' }] },
  amd_gcn2: { controlador: 'amdgpu', vulkan: { from: v(1, 3), to: v(1, 4) }, avisos: [{ aviso: 'gcn_usar_amdgpu', salvo_con: 'amdgpu' }] },
  amd_gcn3_o_posterior: { controlador: 'amdgpu', vulkan: { from: v(1, 3), to: v(1, 4) }, avisos: [] },
  nvidia_tesla_o_anterior: { controlador: 'nouveau', vulkan: null, avisos: [{ aviso: 'nvidia_sin_controlador', salvo_con: null }] },
  nvidia_fermi: { controlador: 'nouveau', vulkan: null, avisos: [{ aviso: 'nvidia_sin_controlador', salvo_con: null }] },
  nvidia_kepler: { controlador: 'nouveau', vulkan: { from: v(1, 2), to: v(1, 2) }, avisos: [{ aviso: 'kepler_470_fin', salvo_con: null }] },
  nvidia_maxwell_a_volta: { controlador: 'nvidia_580xx', vulkan: { from: v(1, 4), to: v(1, 4) }, avisos: [{ aviso: 'fijar_nvidia_580xx', salvo_con: null }] },
  nvidia_turing_o_posterior: { controlador: 'nvidia', vulkan: { from: v(1, 4), to: v(1, 4) }, avisos: [] },
} as const satisfies Record<GpuFamily, Politica>

const ids: Record<GpuVendor, Partial<Record<GpuFamily, string>>> = tablaGpu.ids

const familiaPorId: ReadonlyMap<string, GpuFamily> = new Map(
  GpuVendor.literals.flatMap((vendor) =>
    GpuFamily.literals.flatMap((familia) =>
      decodificarTramos(ids[vendor][familia] ?? '').map((device): [string, GpuFamily] => [`${vendor}:${device.toString(16).padStart(4, '0')}`, familia]),
    ),
  ),
)

const identificar = (pci: PciId | null): { readonly familia: GpuFamily; readonly politica: Politica } | null => {
  const familia = pci === null ? undefined : familiaPorId.get(pci)
  return familia === undefined ? null : { familia, politica: POLITICA[familia] }
}

const vulkanEnLinux = (c: ColumnasEquipo, politica: Politica | null): MachineVulkan => {
  if (c.sistema === 'Linux' && c.soporte_vulkan === 'si') {
    const version = vulkanVersion(c.version_vulkan)
    return { support: 'si', origin: 'medido', range: version === null ? null : { from: version, to: version } }
  }
  if (c.sistema === 'Linux' && c.soporte_vulkan === 'no') return { support: 'no', origin: 'medido' }
  if (politica === null) return { support: 'desconocido' }
  return politica.vulkan === null ? { support: 'no', origin: 'proyectado' } : { support: 'si', origin: 'proyectado', range: politica.vulkan }
}

const rutas: ReadonlyArray<readonly [VulkanVersion, D3dPath]> = [
  [v(1, 4), 'dxvk'],
  [v(1, 3), 'dxvk_2'],
  [v(1, 1), 'dxvk_sarek'],
]

const rutaDe = (vulkan: MachineVulkan): LinuxPaths | null => {
  if (vulkan.support === 'no') return { d3d9_11: 'wined3d', d3d12: false }
  const piso = vulkan.support === 'si' ? vulkan.range?.from : undefined
  if (piso === undefined) return null
  return { d3d9_11: rutas.find(([minimo]) => atLeast(piso, minimo))?.[1] ?? 'wined3d', d3d12: atLeast(piso, v(1, 3)) }
}

const avisosDe = (c: ColumnasEquipo, politica: Politica, vulkan: MachineVulkan): ReadonlyArray<GpuWarning> => {
  const medidoEnLinux = c.sistema === 'Linux' ? c.controlador : null
  const faltaVulkan = vulkan.support === 'no' && vulkan.origin === 'medido' && politica.vulkan !== null
  return [
    ...politica.avisos.filter((a) => a.salvo_con === null || a.salvo_con !== medidoEnLinux).map((a) => a.aviso),
    ...(faltaVulkan ? (['vulkan_no_detectado'] as const) : []),
  ]
}

export const equipoEnLinux = (c: ColumnasEquipo): MachineOnLinux => {
  const gpu = identificar(c.gpu_pci_id)
  const vulkan = vulkanEnLinux(c, gpu?.politica ?? null)
  return {
    sistema: c.sistema,
    ram_mb: c.ram_mb,
    vram_mb: c.vram_mb,
    vulkan,
    gpu:
      gpu === null ? null : { family: gpu.familia, driver: gpu.politica.controlador, warnings: avisosDe(c, gpu.politica, vulkan) },
    paths: rutaDe(vulkan),
  }
}
