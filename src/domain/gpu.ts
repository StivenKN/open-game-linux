import { Schema } from 'effect'
import type { Capabilities } from './evaluation.ts'

export const PciId = Schema.String.pipe(Schema.check(Schema.isPattern(/^[0-9a-f]{4}:[0-9a-f]{4}$/)), Schema.brand('PciId'))
export type PciId = typeof PciId.Type

export const GpuVendor = Schema.Literals(['8086', '1002', '10de'])
export type GpuVendor = typeof GpuVendor.Type

const isGpuVendor = Schema.is(GpuVendor)

export const vendorOf = (pci: PciId): GpuVendor | null => {
  const vendor = pci.slice(0, 4)
  return isGpuVendor(vendor) ? vendor : null
}

export const GpuFamily = Schema.Literals([
  'intel_gen5_o_anterior',
  'intel_gen6',
  'intel_gen7',
  'intel_gen7_5',
  'intel_gen8',
  'intel_gen9_o_posterior',
  'amd_terascale_o_anterior',
  'amd_gcn1',
  'amd_gcn2',
  'amd_gcn3_o_posterior',
  'nvidia_tesla_o_anterior',
  'nvidia_fermi',
  'nvidia_kepler',
  'nvidia_maxwell_a_volta',
  'nvidia_turing_o_posterior',
])
export type GpuFamily = typeof GpuFamily.Type

export const LinuxDriver = Schema.Literals(['i915', 'radeon', 'amdgpu', 'nouveau', 'nvidia_580xx', 'nvidia'])
export type LinuxDriver = typeof LinuxDriver.Type

/** Never Gallium Nine: Mesa 25.2 removed it. */
export const D3dPath = Schema.Literals(['dxvk', 'dxvk_2', 'dxvk_sarek', 'wined3d'])
export type D3dPath = typeof D3dPath.Type

export const GpuWarning = Schema.Literals([
  'gcn_usar_amdgpu',
  'kepler_470_fin',
  'fijar_nvidia_580xx',
  'nvidia_sin_controlador',
  'hasvk_incompleto',
  'vulkan_sin_verificar',
  'vulkan_no_detectado',
])
export type GpuWarning = typeof GpuWarning.Type

export type GpuOnLinux = {
  readonly family: GpuFamily
  readonly driver: LinuxDriver
  readonly warnings: ReadonlyArray<GpuWarning>
}

export type LinuxPaths = { readonly d3d9_11: D3dPath; readonly d3d12: boolean }

export type MachineOnLinux = Capabilities & { readonly gpu: GpuOnLinux | null; readonly paths: LinuxPaths | null }
