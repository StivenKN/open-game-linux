import { Schema } from 'effect'
import type { Capacidades } from './evaluation.ts'

export const PciId = Schema.String.pipe(Schema.check(Schema.isPattern(/^[0-9a-f]{4}:[0-9a-f]{4}$/)), Schema.brand('PciId'))
export type PciId = typeof PciId.Type

export const VendorGpu = Schema.Literals(['8086', '1002', '10de'])
export type VendorGpu = typeof VendorGpu.Type

const esVendorGpu = Schema.is(VendorGpu)

export const vendorDe = (pci: PciId): VendorGpu | null => {
  const vendor = pci.slice(0, 4)
  return esVendorGpu(vendor) ? vendor : null
}

export const FamiliaGpu = Schema.Literals([
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
export type FamiliaGpu = typeof FamiliaGpu.Type

export const ControladorLinux = Schema.Literals(['i915', 'radeon', 'amdgpu', 'nouveau', 'nvidia_580xx', 'nvidia'])
export type ControladorLinux = typeof ControladorLinux.Type

/** Never Gallium Nine: Mesa 25.2 removed it. */
export const RutaD3d = Schema.Literals(['dxvk', 'dxvk_2', 'dxvk_sarek', 'wined3d'])
export type RutaD3d = typeof RutaD3d.Type

export const AvisoGpu = Schema.Literals([
  'gcn_usar_amdgpu',
  'kepler_470_fin',
  'fijar_nvidia_580xx',
  'nvidia_sin_controlador',
  'hasvk_incompleto',
  'vulkan_sin_verificar',
  'vulkan_no_detectado',
])
export type AvisoGpu = typeof AvisoGpu.Type

export type GpuEnLinux = {
  readonly familia: FamiliaGpu
  readonly controlador: ControladorLinux
  readonly avisos: ReadonlyArray<AvisoGpu>
}

export type RutaLinux = { readonly d3d9_11: RutaD3d; readonly d3d12: boolean }

export type EquipoEnLinux = Capacidades & { readonly gpu: GpuEnLinux | null; readonly ruta: RutaLinux | null }
