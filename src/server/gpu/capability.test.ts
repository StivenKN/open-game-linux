import { describe, expect, it } from '@effect/vitest'
import { Schema } from 'effect'
import { vulkanVersion } from '../../domain/evaluation.ts'
import { PciId } from '../../domain/gpu.ts'
import type { Diagnostic } from '../../domain/tables.ts'
import { machineOnLinux } from './capability.ts'

type Row = Pick<Diagnostic, 'operating_system' | 'ram_mb' | 'vram_mb' | 'vulkan_support' | 'vulkan_version' | 'driver' | 'gpu_pci_id'>

const windows = (pci: string | null): Row => ({
  operating_system: 'Windows',
  ram_mb: 8192,
  vram_mb: 2048,
  vulkan_support: 'desconocido',
  vulkan_version: null,
  driver: null,
  gpu_pci_id: pci === null ? null : Schema.decodeSync(PciId)(pci),
})
const linux = (pci: string | null, overrides: Partial<Row> = {}): Row => ({ ...windows(pci), operating_system: 'Linux', ...overrides })

const v = (text: string) => {
  const version = vulkanVersion(text)
  if (version === null) throw new Error(`not a version: ${text}`)
  return version
}
const projected = (from: string, to: string) => ({ support: 'si', origin: 'proyectado', range: { from: v(from), to: v(to) } }) as const

describe('machineOnLinux: golden GPUs (Windows capture, nothing measured)', () => {
  it.each([
    ['GT 710', '10de:128b', 'nvidia_kepler', 'nouveau', projected('1.2', '1.2'), { d3d9_11: 'dxvk_sarek', d3d12: false }, ['kepler_470_fin']],
    ['GTX 750 Ti', '10de:1380', 'nvidia_maxwell_a_volta', 'nvidia_580xx', projected('1.4', '1.4'), { d3d9_11: 'dxvk', d3d12: true }, ['fijar_nvidia_580xx']],
    ['GTX 1050 Ti', '10de:1c82', 'nvidia_maxwell_a_volta', 'nvidia_580xx', projected('1.4', '1.4'), { d3d9_11: 'dxvk', d3d12: true }, ['fijar_nvidia_580xx']],
    ['GT 430 (Fermi)', '10de:0de1', 'nvidia_fermi', 'nouveau', { support: 'no', origin: 'proyectado' }, { d3d9_11: 'wined3d', d3d12: false }, ['nvidia_sin_controlador']],
    ['HD 4600 (Haswell)', '8086:0412', 'intel_gen7_5', 'i915', projected('1.0', '1.1'), { d3d9_11: 'wined3d', d3d12: false }, ['vulkan_sin_verificar']],
    ['HD 4000 (Ivy Bridge)', '8086:0166', 'intel_gen7', 'i915', { support: 'no', origin: 'proyectado' }, { d3d9_11: 'wined3d', d3d12: false }, ['hasvk_incompleto']],
    ['HD 530 (Skylake)', '8086:1912', 'intel_gen9_o_posterior', 'i915', projected('1.3', '1.4'), { d3d9_11: 'dxvk_2', d3d12: true }, []],
    ['HD 7970 (GCN 1)', '1002:6798', 'amd_gcn1', 'amdgpu', projected('1.3', '1.4'), { d3d9_11: 'dxvk_2', d3d12: true }, ['gcn_usar_amdgpu']],
    ['R7 260X (Bonaire, GCN 2)', '1002:6658', 'amd_gcn2', 'amdgpu', projected('1.3', '1.4'), { d3d9_11: 'dxvk_2', d3d12: true }, ['gcn_usar_amdgpu']],
    ['RX 580', '1002:67df', 'amd_gcn3_o_posterior', 'amdgpu', projected('1.3', '1.4'), { d3d9_11: 'dxvk_2', d3d12: true }, []],
    ['HD 5450 (TeraScale)', '1002:68f9', 'amd_terascale_o_anterior', 'radeon', { support: 'no', origin: 'proyectado' }, { d3d9_11: 'wined3d', d3d12: false }, []],
  ])('%s %s -> %s', (_, pci, family, driver, vulkan, paths, warnings) => {
    expect(machineOnLinux(windows(pci))).toEqual({
      operating_system: 'Windows',
      ram_mb: 8192,
      vram_mb: 2048,
      vulkan,
      gpu: { family, driver, warnings },
      paths,
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
    expect(machineOnLinux(windows(pci))).toMatchObject({ vulkan: { support: 'desconocido' }, gpu: null, paths: null })
  })
})

describe('machineOnLinux: measured Linux Vulkan wins over the projection', () => {
  it('vulkaninfo 1.3.275 on a Kepler card is used as measured', () => {
    expect(machineOnLinux(linux('10de:128b', { vulkan_support: 'si', vulkan_version: '1.3.275', driver: 'nouveau' }))).toMatchObject({
      vulkan: { support: 'si', origin: 'medido', range: { from: v('1.3.275'), to: v('1.3.275') } },
      paths: { d3d9_11: 'dxvk_2', d3d12: true },
    })
  })
  it('Linux without vulkaninfo projects from the family', () => {
    expect(machineOnLinux(linux('10de:1380')).vulkan).toEqual(projected('1.4', '1.4'))
  })
  it("a Windows capture's stored Vulkan is ignored", () => {
    expect(machineOnLinux({ ...windows('10de:0de1'), vulkan_support: 'si', vulkan_version: '1.4' }).vulkan).toEqual({ support: 'no', origin: 'proyectado' })
  })
  it('measured Vulkan support without a version leaves the path unknown', () => {
    expect(machineOnLinux(linux('1002:67df', { vulkan_support: 'si' }))).toMatchObject({ vulkan: { support: 'si', origin: 'medido', range: null }, paths: null })
  })
  it('measured no Vulkan on a GPU that has it warns that drivers are missing', () => {
    expect(machineOnLinux(linux('8086:1912', { vulkan_support: 'no', driver: 'i915' }))).toMatchObject({
      vulkan: { support: 'no', origin: 'medido' },
      gpu: { warnings: ['vulkan_no_detectado'] },
      paths: { d3d9_11: 'wined3d', d3d12: false },
    })
  })
  it('measured Linux Vulkan still counts without a PCI id', () => {
    expect(machineOnLinux(linux(null, { vulkan_support: 'si', vulkan_version: '1.3' }))).toMatchObject({ gpu: null, paths: { d3d9_11: 'dxvk_2', d3d12: true } })
  })
})

describe('machineOnLinux: unless_driver', () => {
  it.each([
    ['Windows (no Linux driver measured)', windows('1002:6798'), ['gcn_usar_amdgpu']],
    ['Linux on radeon', linux('1002:6798', { driver: 'radeon' }), ['gcn_usar_amdgpu']],
    ['Linux already on amdgpu', linux('1002:6798', { driver: 'amdgpu' }), []],
  ])('GCN 1 on %s', (_, columns, warnings) => {
    expect(machineOnLinux(columns).gpu?.warnings).toEqual(warnings)
  })
})
