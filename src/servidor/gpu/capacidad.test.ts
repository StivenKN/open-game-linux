import { describe, expect, it } from '@effect/vitest'
import { Schema } from 'effect'
import { versionVulkan } from '../../dominio/evaluacion.ts'
import { PciId } from '../../dominio/gpu.ts'
import { type ColumnasEquipo, equipoEnLinux } from './capacidad.ts'

const windows = (pci: string | null): ColumnasEquipo => ({
  sistema: 'Windows',
  ram_mb: 8192,
  vram_mb: 2048,
  soporte_vulkan: 'desconocido',
  version_vulkan: null,
  controlador: null,
  gpu_pci_id: pci === null ? null : Schema.decodeSync(PciId)(pci),
})
const linux = (pci: string | null, cambios: Partial<ColumnasEquipo> = {}): ColumnasEquipo => ({ ...windows(pci), sistema: 'Linux', ...cambios })

const v = (texto: string) => {
  const version = versionVulkan(texto)
  if (version === null) throw new Error(`not a version: ${texto}`)
  return version
}
const proyectado = (desde: string, hasta: string) => ({ soporte: 'si', origen: 'proyectado', rango: { desde: v(desde), hasta: v(hasta) } }) as const

// Every id checked against pci.ids at the generator's pinned commit.
describe('equipoEnLinux: golden GPUs (Windows capture, nothing measured)', () => {
  it.each([
    ['GT 710', '10de:128b', 'nvidia_kepler', 'nouveau', proyectado('1.2', '1.2'), { d3d9_11: 'dxvk_sarek', d3d12: false }, ['kepler_470_fin']],
    ['GTX 750 Ti', '10de:1380', 'nvidia_maxwell_a_volta', 'nvidia_580xx', proyectado('1.4', '1.4'), { d3d9_11: 'dxvk', d3d12: true }, ['fijar_nvidia_580xx']],
    ['GTX 1050 Ti', '10de:1c82', 'nvidia_maxwell_a_volta', 'nvidia_580xx', proyectado('1.4', '1.4'), { d3d9_11: 'dxvk', d3d12: true }, ['fijar_nvidia_580xx']],
    ['GT 430 (Fermi)', '10de:0de1', 'nvidia_fermi', 'nouveau', { soporte: 'no', origen: 'proyectado' }, { d3d9_11: 'wined3d', d3d12: false }, ['nvidia_sin_controlador']],
    ['HD 4600 (Haswell)', '8086:0412', 'intel_gen7_5', 'i915', proyectado('1.0', '1.1'), { d3d9_11: 'wined3d', d3d12: false }, ['vulkan_sin_verificar']],
    ['HD 4000 (Ivy Bridge)', '8086:0166', 'intel_gen7', 'i915', { soporte: 'no', origen: 'proyectado' }, { d3d9_11: 'wined3d', d3d12: false }, ['hasvk_incompleto']],
    ['HD 530 (Skylake)', '8086:1912', 'intel_gen9_o_posterior', 'i915', proyectado('1.3', '1.4'), { d3d9_11: 'dxvk_2', d3d12: true }, []],
    ['HD 7970 (GCN 1)', '1002:6798', 'amd_gcn1', 'amdgpu', proyectado('1.3', '1.4'), { d3d9_11: 'dxvk_2', d3d12: true }, ['gcn_usar_amdgpu']],
    ['R7 260X (Bonaire, GCN 2)', '1002:6658', 'amd_gcn2', 'amdgpu', proyectado('1.3', '1.4'), { d3d9_11: 'dxvk_2', d3d12: true }, ['gcn_usar_amdgpu']],
    ['RX 580', '1002:67df', 'amd_gcn3_o_posterior', 'amdgpu', proyectado('1.3', '1.4'), { d3d9_11: 'dxvk_2', d3d12: true }, []],
    ['HD 5450 (TeraScale)', '1002:68f9', 'amd_terascale_o_anterior', 'radeon', { soporte: 'no', origen: 'proyectado' }, { d3d9_11: 'wined3d', d3d12: false }, []],
  ])('%s %s -> %s', (_, pci, familia, controlador, vulkan, ruta, avisos) => {
    expect(equipoEnLinux(windows(pci))).toEqual({
      sistema: 'Windows',
      ram_mb: 8192,
      vram_mb: 2048,
      vulkan,
      gpu: { familia, controlador, avisos },
      ruta,
    })
  })

  it.each([
    ['PowerVR GMA 500', '8086:8108'],
    ['PowerVR GMA 3600', '8086:0be1'],
    ['Intel i810', '8086:7121'],
    ['Radeon 7000', '1002:5159'],
    ['virtio', '1af4:1050'],
    ['an NVIDIA id pci.ids does not list', '10de:fff0'],
    ['no PCI id', null],
  ])('%s has no GPU and nothing to project', (_, pci) => {
    expect(equipoEnLinux(windows(pci))).toMatchObject({ vulkan: { soporte: 'desconocido' }, gpu: null, ruta: null })
  })
})

describe('equipoEnLinux: measured Linux Vulkan wins over the projection', () => {
  it('vulkaninfo 1.3.275 on a Kepler card is used as measured', () => {
    expect(equipoEnLinux(linux('10de:128b', { soporte_vulkan: 'si', version_vulkan: '1.3.275', controlador: 'nouveau' }))).toMatchObject({
      vulkan: { soporte: 'si', origen: 'medido', rango: { desde: v('1.3.275'), hasta: v('1.3.275') } },
      ruta: { d3d9_11: 'dxvk_2', d3d12: true },
    })
  })
  it('Linux without vulkaninfo projects from the family', () => {
    expect(equipoEnLinux(linux('10de:1380')).vulkan).toEqual(proyectado('1.4', '1.4'))
  })
  it("a Windows capture's stored Vulkan is ignored", () => {
    expect(equipoEnLinux({ ...windows('10de:0de1'), soporte_vulkan: 'si', version_vulkan: '1.4' }).vulkan).toEqual({ soporte: 'no', origen: 'proyectado' })
  })
  it('measured Vulkan support without a version leaves the path unknown', () => {
    expect(equipoEnLinux(linux('1002:67df', { soporte_vulkan: 'si' }))).toMatchObject({ vulkan: { soporte: 'si', origen: 'medido', rango: null }, ruta: null })
  })
  it('measured no Vulkan on a GPU that has it warns that drivers are missing', () => {
    expect(equipoEnLinux(linux('8086:1912', { soporte_vulkan: 'no', controlador: 'i915' }))).toMatchObject({
      vulkan: { soporte: 'no', origen: 'medido' },
      gpu: { avisos: ['vulkan_no_detectado'] },
      ruta: { d3d9_11: 'wined3d', d3d12: false },
    })
  })
  it('measured Linux Vulkan still counts without a PCI id', () => {
    expect(equipoEnLinux(linux(null, { soporte_vulkan: 'si', version_vulkan: '1.3' }))).toMatchObject({ gpu: null, ruta: { d3d9_11: 'dxvk_2', d3d12: true } })
  })
})

describe('equipoEnLinux: salvo_con', () => {
  it.each([
    ['Windows (no Linux driver measured)', windows('1002:6798'), ['gcn_usar_amdgpu']],
    ['Linux on radeon', linux('1002:6798', { controlador: 'radeon' }), ['gcn_usar_amdgpu']],
    ['Linux already on amdgpu', linux('1002:6798', { controlador: 'amdgpu' }), []],
  ])('GCN 1 on %s', (_, columnas, avisos) => {
    expect(equipoEnLinux(columnas).gpu?.avisos).toEqual(avisos)
  })
})
