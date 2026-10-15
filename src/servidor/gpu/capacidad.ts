import { alMenos, type Sistema, type SoporteVulkan, type VersionVulkan, versionVulkan, type VulkanEquipo } from '../../dominio/evaluacion.ts'
import { type AvisoGpu, type ControladorLinux, type EquipoEnLinux, FamiliaGpu, type PciId, type RutaD3d, type RutaLinux } from '../../dominio/gpu.ts'
import { tablaGpu } from './familias.generado.ts'

/** The diagnostico columns the projection reads. */
export type ColumnasEquipo = {
  readonly sistema: Sistema
  readonly ram_mb: number
  readonly vram_mb: number | null
  readonly soporte_vulkan: SoporteVulkan
  readonly version_vulkan: string | null
  readonly controlador: string | null
  readonly gpu_pci_id: PciId | null
}

const v = (mayor: number, menor: number): VersionVulkan => ({ texto: `${mayor}.${menor}`, partes: [mayor, menor] })
const rango = (desde: VersionVulkan, hasta: VersionVulkan) => ({ desde, hasta })

type Politica = {
  readonly controlador: ControladorLinux
  readonly vulkan: { readonly desde: VersionVulkan; readonly hasta: VersionVulkan } | null
  /** `salvo_con`: the warning is moot when the measured Linux kernel driver is already that one. */
  readonly avisos: ReadonlyArray<{ readonly aviso: AvisoGpu; readonly salvo_con: ControladorLinux | null }>
}

// Research of Oct 2026. A range marks a level nobody has read with vulkaninfo on real hardware yet.
const POLITICA = {
  intel_gen5_o_anterior: { controlador: 'i915', vulkan: null, avisos: [] },
  intel_gen6: { controlador: 'i915', vulkan: null, avisos: [] },
  intel_gen7: { controlador: 'i915', vulkan: null, avisos: [{ aviso: 'hasvk_incompleto', salvo_con: null }] },
  intel_gen7_5: { controlador: 'i915', vulkan: rango(v(1, 0), v(1, 1)), avisos: [{ aviso: 'vulkan_sin_verificar', salvo_con: null }] },
  intel_gen8: { controlador: 'i915', vulkan: rango(v(1, 1), v(1, 2)), avisos: [{ aviso: 'vulkan_sin_verificar', salvo_con: null }] },
  intel_gen9_o_posterior: { controlador: 'i915', vulkan: rango(v(1, 3), v(1, 4)), avisos: [] },
  amd_terascale_o_anterior: { controlador: 'radeon', vulkan: null, avisos: [] },
  amd_gcn1: { controlador: 'amdgpu', vulkan: rango(v(1, 3), v(1, 4)), avisos: [{ aviso: 'gcn_usar_amdgpu', salvo_con: 'amdgpu' }] },
  amd_gcn2: { controlador: 'amdgpu', vulkan: rango(v(1, 3), v(1, 4)), avisos: [{ aviso: 'gcn_usar_amdgpu', salvo_con: 'amdgpu' }] },
  amd_gcn3_o_posterior: { controlador: 'amdgpu', vulkan: rango(v(1, 3), v(1, 4)), avisos: [] },
  nvidia_tesla_o_anterior: { controlador: 'nouveau', vulkan: null, avisos: [{ aviso: 'nvidia_sin_controlador', salvo_con: null }] },
  nvidia_fermi: { controlador: 'nouveau', vulkan: null, avisos: [{ aviso: 'nvidia_sin_controlador', salvo_con: null }] },
  nvidia_kepler: { controlador: 'nouveau', vulkan: rango(v(1, 2), v(1, 2)), avisos: [{ aviso: 'kepler_470_fin', salvo_con: null }] },
  nvidia_maxwell_a_volta: { controlador: 'nvidia_580xx', vulkan: rango(v(1, 4), v(1, 4)), avisos: [{ aviso: 'fijar_nvidia_580xx', salvo_con: null }] },
  nvidia_turing_o_posterior: { controlador: 'nvidia', vulkan: rango(v(1, 4), v(1, 4)), avisos: [] },
} as const satisfies Record<FamiliaGpu, Politica>

const vendores = ['8086', '1002', '10de'] as const
const ids: Record<(typeof vendores)[number], Partial<Record<FamiliaGpu, string>>> = tablaGpu.ids

const familiaPorId: ReadonlyMap<string, FamiliaGpu> = new Map(
  vendores.flatMap((vendor) =>
    FamiliaGpu.literals.flatMap((familia) =>
      (ids[vendor][familia]?.split(' ') ?? []).flatMap((tramo) => {
        const [desde = 0, hasta = desde] = tramo.split('-').map((h) => parseInt(h, 16))
        return Array.from({ length: hasta - desde + 1 }, (_, i): [string, FamiliaGpu] => [`${vendor}:${(desde + i).toString(16).padStart(4, '0')}`, familia])
      }),
    ),
  ),
)

// The sources list every Intel and AMD id up to the IP-discovery era, so an unknown id from these vendors
// is a newer part. NVIDIA has no fallback: pci.ids is complete for it, and an unknown id is not a GPU.
const familiaSupuesta: Readonly<Record<string, FamiliaGpu>> = { '8086': 'intel_gen9_o_posterior', '1002': 'amd_gcn3_o_posterior' }

const identificar = (pci: PciId): { readonly familia: FamiliaGpu; readonly supuesta: boolean } | null => {
  const exacta = familiaPorId.get(pci)
  if (exacta !== undefined) return { familia: exacta, supuesta: false }
  const supuesta = familiaSupuesta[pci.slice(0, 4)]
  return supuesta === undefined ? null : { familia: supuesta, supuesta: true }
}

/** Measured Linux Vulkan wins; otherwise the family projects it. A Windows row's stored Vulkan is never used. */
const vulkanEnLinux = (c: ColumnasEquipo, politica: Politica | null): VulkanEquipo => {
  if (c.sistema === 'Linux' && c.soporte_vulkan === 'si') return { origen: 'medido', soporte: 'si', version: versionVulkan(c.version_vulkan) }
  if (c.sistema === 'Linux' && c.soporte_vulkan === 'no') return { origen: 'medido', soporte: 'no' }
  if (politica === null) return { soporte: 'desconocido' }
  return politica.vulkan === null ? { origen: 'proyectado', soporte: 'no' } : { origen: 'proyectado', soporte: 'si', ...politica.vulkan }
}

const rutas: ReadonlyArray<readonly [VersionVulkan, RutaD3d]> = [
  [v(1, 4), 'dxvk'],
  [v(1, 3), 'dxvk_2'],
  [v(1, 1), 'dxvk_sarek'],
]

const rutaDe = (vulkan: VulkanEquipo): RutaLinux | null => {
  if (vulkan.soporte === 'desconocido') return null
  if (vulkan.soporte === 'no') return { d3d9_11: 'wined3d', d3d12: false }
  const piso = vulkan.origen === 'medido' ? vulkan.version : vulkan.desde
  if (piso === null) return null
  return { d3d9_11: rutas.find(([minimo]) => alMenos(piso, minimo))?.[1] ?? 'wined3d', d3d12: alMenos(piso, v(1, 3)) }
}

const avisosDe = (c: ColumnasEquipo, politica: Politica, supuesta: boolean, vulkan: VulkanEquipo): ReadonlyArray<AvisoGpu> => {
  const medidoEnLinux = c.sistema === 'Linux' ? c.controlador : null
  const faltaVulkan = vulkan.soporte === 'no' && vulkan.origen === 'medido' && politica.vulkan !== null
  return [
    ...politica.avisos.filter((a) => a.salvo_con === null || a.salvo_con !== medidoEnLinux).map((a) => a.aviso),
    ...(faltaVulkan ? (['vulkan_no_detectado'] as const) : []),
    ...(supuesta ? (['gpu_supuesta'] as const) : []),
  ]
}

/** The one way to build what `evaluar` consumes from a stored or unsaved capture. */
export const equipoEnLinux = (c: ColumnasEquipo): EquipoEnLinux => {
  const identificada = c.gpu_pci_id === null ? null : identificar(c.gpu_pci_id)
  const politica: Politica | null = identificada === null ? null : POLITICA[identificada.familia]
  const vulkan = vulkanEnLinux(c, politica)
  return {
    sistema: c.sistema,
    ram_mb: c.ram_mb,
    vram_mb: c.vram_mb,
    vulkan,
    gpu:
      identificada === null || politica === null
        ? null
        : {
            familia: identificada.familia,
            supuesta: identificada.supuesta,
            controlador: politica.controlador,
            avisos: avisosDe(c, politica, identificada.supuesta, vulkan),
          },
    ruta: rutaDe(vulkan),
  }
}
