import { describe, expect, it } from '@effect/vitest'
import { Schema } from 'effect'
import { equipoEnLinux } from '../server/gpu/capability.ts'
import { type ClaveDistro, descartarDistros, type DistroEvaluada } from './distros.ts'
import { PciId } from './gpu.ts'

const equipo = (pci: string | null) =>
  equipoEnLinux({ sistema: 'Windows', ram_mb: 8192, vram_mb: 2048, gpu_pci_id: pci === null ? null : Schema.decodeSync(PciId)(pci) })

const resumen = (pci: string | null, arquitectura = 'x86_64') =>
  descartarDistros(equipo(pci), arquitectura).map((d): [ClaveDistro, DistroEvaluada['veredicto'], DistroEvaluada['objeciones']] => [d.clave, d.veredicto, d.objeciones])

describe('descartarDistros', () => {
  it('Kepler: Bazzite is out; Ubuntu and Mint can keep 470 on kernel 6.8; the rest need NVK', () => {
    expect(resumen('10de:128b')).toEqual([
      ['mint_22', 'con_ajustes', [{ codigo: 'kepler_470', salida: 'kernel_6_8' }]],
      ['ubuntu_2404', 'con_ajustes', [{ codigo: 'kepler_470', salida: 'kernel_6_8' }]],
      ['fedora', 'con_ajustes', [{ codigo: 'kepler_470', salida: 'desconocido' }]],
      ['bazzite', 'descartada', [{ codigo: 'kepler_sin_soporte' }]],
      ['cachyos', 'con_ajustes', [{ codigo: 'kepler_470', salida: 'desconocido' }]],
      ['arch', 'con_ajustes', [{ codigo: 'kepler_470', salida: 'desconocido' }]],
    ])
  })

  it('Maxwell: every distro needs branch 580, and only Arch and Bazzite say how', () => {
    expect(resumen('10de:1380')).toEqual([
      ['mint_22', 'con_ajustes', [{ codigo: 'rama_580', como: 'desconocido' }]],
      ['ubuntu_2404', 'con_ajustes', [{ codigo: 'rama_580', como: 'desconocido' }]],
      ['fedora', 'con_ajustes', [{ codigo: 'rama_580', como: 'desconocido' }]],
      ['bazzite', 'con_ajustes', [{ codigo: 'rama_580', como: 'imagen_nvidia' }]],
      ['cachyos', 'con_ajustes', [{ codigo: 'rama_580', como: 'desconocido' }]],
      ['arch', 'con_ajustes', [{ codigo: 'rama_580', como: 'paquete_580xx' }]],
    ])
  })

  it('GCN 1: amdgpu everywhere, and Ubuntu has a kernel where it is the default', () => {
    expect(resumen('1002:6798')).toEqual([
      ['mint_22', 'con_ajustes', [{ codigo: 'gcn_amdgpu', como: 'desconocido' }]],
      ['ubuntu_2404', 'con_ajustes', [{ codigo: 'gcn_amdgpu', como: 'kernel_hwe' }]],
      ['fedora', 'con_ajustes', [{ codigo: 'gcn_amdgpu', como: 'desconocido' }]],
      ['bazzite', 'con_ajustes', [{ codigo: 'gcn_amdgpu', como: 'desconocido' }]],
      ['cachyos', 'con_ajustes', [{ codigo: 'gcn_amdgpu', como: 'desconocido' }]],
      ['arch', 'con_ajustes', [{ codigo: 'gcn_amdgpu', como: 'desconocido' }]],
    ])
  })

  it('a modern AMD card raises nothing anywhere', () => {
    expect(resumen('1002:67df')).toEqual(
      ['mint_22', 'ubuntu_2404', 'fedora', 'bazzite', 'cachyos', 'arch'].map((clave) => [clave, 'sin_objeciones', []]),
    )
  })

  it('aarch64 rules out every distro', () => {
    expect(resumen('1002:67df', 'aarch64')).toEqual(
      ['mint_22', 'ubuntu_2404', 'fedora', 'bazzite', 'cachyos', 'arch'].map((clave) => [clave, 'descartada', [{ codigo: 'arquitectura', tiene: 'aarch64' }]]),
    )
  })

  it('an unknown GPU never passes silently', () => {
    expect(resumen(null)).toEqual(
      ['mint_22', 'ubuntu_2404', 'fedora', 'bazzite', 'cachyos', 'arch'].map((clave) => [clave, 'con_ajustes', [{ codigo: 'gpu_desconocida' }]]),
    )
  })
})
