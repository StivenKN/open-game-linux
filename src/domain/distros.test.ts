import { describe, expect, it } from '@effect/vitest'
import { Schema } from 'effect'
import { equipoEnLinux } from '../server/gpu/capability.ts'
import { type DistroKey, screenDistros, type EvaluatedDistro } from './distros.ts'
import { PciId } from './gpu.ts'

const machine = (pci: string | null) =>
  equipoEnLinux({ sistema: 'Windows', ram_mb: 8192, vram_mb: 2048, gpu_pci_id: pci === null ? null : Schema.decodeSync(PciId)(pci) })

const summary = (pci: string | null, architecture = 'x86_64') =>
  screenDistros(machine(pci), architecture).map((d): [DistroKey, EvaluatedDistro['verdict'], EvaluatedDistro['objections']] => [d.key, d.verdict, d.objections])

describe('descartarDistros', () => {
  it('Kepler: Bazzite is out; Ubuntu and Mint can keep 470 on kernel 6.8; the rest need NVK', () => {
    expect(summary('10de:128b')).toEqual([
      ['mint_22', 'con_ajustes', [{ code: 'kepler_470', kernel: 'kernel_6_8' }]],
      ['ubuntu_2404', 'con_ajustes', [{ code: 'kepler_470', kernel: 'kernel_6_8' }]],
      ['fedora', 'con_ajustes', [{ code: 'kepler_470', kernel: 'desconocido' }]],
      ['bazzite', 'descartada', [{ code: 'kepler_sin_soporte' }]],
      ['cachyos', 'con_ajustes', [{ code: 'kepler_470', kernel: 'desconocido' }]],
      ['arch', 'con_ajustes', [{ code: 'kepler_470', kernel: 'desconocido' }]],
    ])
  })

  it('Maxwell: every distro needs branch 580, and only Arch and Bazzite say how', () => {
    expect(summary('10de:1380')).toEqual([
      ['mint_22', 'con_ajustes', [{ code: 'rama_580', via: 'desconocido' }]],
      ['ubuntu_2404', 'con_ajustes', [{ code: 'rama_580', via: 'desconocido' }]],
      ['fedora', 'con_ajustes', [{ code: 'rama_580', via: 'desconocido' }]],
      ['bazzite', 'con_ajustes', [{ code: 'rama_580', via: 'imagen_nvidia' }]],
      ['cachyos', 'con_ajustes', [{ code: 'rama_580', via: 'desconocido' }]],
      ['arch', 'con_ajustes', [{ code: 'rama_580', via: 'paquete_580xx' }]],
    ])
  })

  it('GCN 1: amdgpu everywhere, and Ubuntu has a kernel where it is the default', () => {
    expect(summary('1002:6798')).toEqual([
      ['mint_22', 'con_ajustes', [{ code: 'gcn_amdgpu', via: 'desconocido' }]],
      ['ubuntu_2404', 'con_ajustes', [{ code: 'gcn_amdgpu', via: 'kernel_hwe' }]],
      ['fedora', 'con_ajustes', [{ code: 'gcn_amdgpu', via: 'desconocido' }]],
      ['bazzite', 'con_ajustes', [{ code: 'gcn_amdgpu', via: 'desconocido' }]],
      ['cachyos', 'con_ajustes', [{ code: 'gcn_amdgpu', via: 'desconocido' }]],
      ['arch', 'con_ajustes', [{ code: 'gcn_amdgpu', via: 'desconocido' }]],
    ])
  })

  it('a modern AMD card raises nothing anywhere', () => {
    expect(summary('1002:67df')).toEqual(
      ['mint_22', 'ubuntu_2404', 'fedora', 'bazzite', 'cachyos', 'arch'].map((key) => [key, 'sin_objeciones', []]),
    )
  })

  it('aarch64 rules out every distro', () => {
    expect(summary('1002:67df', 'aarch64')).toEqual(
      ['mint_22', 'ubuntu_2404', 'fedora', 'bazzite', 'cachyos', 'arch'].map((key) => [key, 'descartada', [{ code: 'arquitectura', has: 'aarch64' }]]),
    )
  })

  it('an unknown GPU never passes silently', () => {
    expect(summary(null)).toEqual(
      ['mint_22', 'ubuntu_2404', 'fedora', 'bazzite', 'cachyos', 'arch'].map((key) => [key, 'con_ajustes', [{ code: 'gpu_desconocida' }]]),
    )
  })
})
