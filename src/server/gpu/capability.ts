import { atLeast, type VulkanRange, type VulkanVersion, vulkanVersion, type MachineVulkan } from '../../domain/evaluation.ts'
import { type GpuWarning, type LinuxDriver, type MachineOnLinux, GpuFamily, type PciId, type D3dPath, type LinuxPaths, GpuVendor } from '../../domain/gpu.ts'
import type { Diagnostic } from '../../domain/tables.ts'
import { gpuTable } from './families.generated.ts'
import { decodeSpans } from './ranges.ts'

export type MachineColumns = Pick<Diagnostic, 'ram_mb' | 'vram_mb' | 'gpu_pci_id'> &
  ({ readonly operating_system: 'Linux' } & Pick<Diagnostic, 'vulkan_support' | 'vulkan_version' | 'driver'> | { readonly operating_system: 'Windows' })

const v = (major: number, minor: number): VulkanVersion => ({ text: `${major}.${minor}`, parts: [major, minor] })

type Policy = {
  readonly driver: LinuxDriver
  readonly vulkan: VulkanRange | null
  readonly warnings: ReadonlyArray<{ readonly warning: GpuWarning; readonly unless_driver: LinuxDriver | null }>
}

const POLICY = {
  intel_gen5_o_anterior: { driver: 'i915', vulkan: null, warnings: [] },
  intel_gen6: { driver: 'i915', vulkan: null, warnings: [] },
  intel_gen7: { driver: 'i915', vulkan: null, warnings: [{ warning: 'hasvk_incompleto', unless_driver: null }] },
  intel_gen7_5: { driver: 'i915', vulkan: { from: v(1, 0), to: v(1, 1) }, warnings: [{ warning: 'vulkan_sin_verificar', unless_driver: null }] },
  intel_gen8: { driver: 'i915', vulkan: { from: v(1, 1), to: v(1, 2) }, warnings: [{ warning: 'vulkan_sin_verificar', unless_driver: null }] },
  intel_gen9_o_posterior: { driver: 'i915', vulkan: { from: v(1, 3), to: v(1, 4) }, warnings: [] },
  amd_terascale_o_anterior: { driver: 'radeon', vulkan: null, warnings: [] },
  amd_gcn1: { driver: 'amdgpu', vulkan: { from: v(1, 3), to: v(1, 4) }, warnings: [{ warning: 'gcn_usar_amdgpu', unless_driver: 'amdgpu' }] },
  amd_gcn2: { driver: 'amdgpu', vulkan: { from: v(1, 3), to: v(1, 4) }, warnings: [{ warning: 'gcn_usar_amdgpu', unless_driver: 'amdgpu' }] },
  amd_gcn3_o_posterior: { driver: 'amdgpu', vulkan: { from: v(1, 3), to: v(1, 4) }, warnings: [] },
  nvidia_tesla_o_anterior: { driver: 'nouveau', vulkan: null, warnings: [{ warning: 'nvidia_sin_controlador', unless_driver: null }] },
  nvidia_fermi: { driver: 'nouveau', vulkan: null, warnings: [{ warning: 'nvidia_sin_controlador', unless_driver: null }] },
  nvidia_kepler: { driver: 'nouveau', vulkan: { from: v(1, 2), to: v(1, 2) }, warnings: [{ warning: 'kepler_470_fin', unless_driver: null }] },
  nvidia_maxwell_a_volta: { driver: 'nvidia_580xx', vulkan: { from: v(1, 4), to: v(1, 4) }, warnings: [{ warning: 'fijar_nvidia_580xx', unless_driver: null }] },
  nvidia_turing_o_posterior: { driver: 'nvidia', vulkan: { from: v(1, 4), to: v(1, 4) }, warnings: [] },
} as const satisfies Record<GpuFamily, Policy>

const ids: Record<GpuVendor, Partial<Record<GpuFamily, string>>> = gpuTable.ids

const familyById: ReadonlyMap<string, GpuFamily> = new Map(
  GpuVendor.literals.flatMap((vendor) =>
    GpuFamily.literals.flatMap((family) =>
      decodeSpans(ids[vendor][family] ?? '').map((device): [string, GpuFamily] => [`${vendor}:${device.toString(16).padStart(4, '0')}`, family]),
    ),
  ),
)

const identify = (pci: PciId | null): { readonly family: GpuFamily; readonly policy: Policy } | null => {
  const family = pci === null ? undefined : familyById.get(pci)
  return family === undefined ? null : { family, policy: POLICY[family] }
}

const vulkanOnLinux = (c: MachineColumns, policy: Policy | null): MachineVulkan => {
  if (c.operating_system === 'Linux' && c.vulkan_support === 'si') {
    const version = vulkanVersion(c.vulkan_version)
    return { support: 'si', origin: 'medido', range: version === null ? null : { from: version, to: version } }
  }
  if (c.operating_system === 'Linux' && c.vulkan_support === 'no') return { support: 'no', origin: 'medido' }
  if (policy === null) return { support: 'desconocido' }
  return policy.vulkan === null ? { support: 'no', origin: 'proyectado' } : { support: 'si', origin: 'proyectado', range: policy.vulkan }
}

const d3dPaths: ReadonlyArray<readonly [VulkanVersion, D3dPath]> = [
  [v(1, 4), 'dxvk'],
  [v(1, 3), 'dxvk_2'],
  [v(1, 1), 'dxvk_sarek'],
]

const pathsOf = (vulkan: MachineVulkan): LinuxPaths | null => {
  if (vulkan.support === 'no') return { d3d9_11: 'wined3d', d3d12: false }
  const floor = vulkan.support === 'si' ? vulkan.range?.from : undefined
  if (floor === undefined) return null
  return { d3d9_11: d3dPaths.find(([minimum]) => atLeast(floor, minimum))?.[1] ?? 'wined3d', d3d12: atLeast(floor, v(1, 3)) }
}

const warningsOf = (c: MachineColumns, policy: Policy, vulkan: MachineVulkan): ReadonlyArray<GpuWarning> => {
  const measuredDriver = c.operating_system === 'Linux' ? c.driver : null
  const missingVulkan = vulkan.support === 'no' && vulkan.origin === 'medido' && policy.vulkan !== null
  return [
    ...policy.warnings.filter((a) => a.unless_driver === null || a.unless_driver !== measuredDriver).map((a) => a.warning),
    ...(missingVulkan ? (['vulkan_no_detectado'] as const) : []),
  ]
}

export const machineOnLinux = (c: MachineColumns): MachineOnLinux => {
  const gpu = identify(c.gpu_pci_id)
  const vulkan = vulkanOnLinux(c, gpu?.policy ?? null)
  return {
    operating_system: c.operating_system,
    ram_mb: c.ram_mb,
    vram_mb: c.vram_mb,
    vulkan,
    gpu:
      gpu === null ? null : { family: gpu.family, driver: gpu.policy.driver, warnings: warningsOf(c, gpu.policy, vulkan) },
    paths: pathsOf(vulkan),
  }
}
