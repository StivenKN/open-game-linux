import { describe, expect, it } from '@effect/vitest'
import { Schema } from 'effect'
import { type ColumnasEquipo, equipoEnLinux } from '../server/gpu/capability.ts'
import { PciId } from './gpu.ts'
import type { GraphicsApi } from './literals.ts'
import type { X86Level } from './platform.ts'
import { type GamePath, gamePath } from './graphics-path.ts'

const pci = (id: string | null) => (id === null ? null : Schema.decodeSync(PciId)(id))
const windows = (id: string | null): ColumnasEquipo => ({ sistema: 'Windows', ram_mb: 8192, vram_mb: 2048, gpu_pci_id: pci(id) })
const linux = (id: string | null, vulkan: string | null): ColumnasEquipo => ({
  sistema: 'Linux',
  ram_mb: 8192,
  vram_mb: 2048,
  gpu_pci_id: pci(id),
  controlador: null,
  soporte_vulkan: vulkan === null ? 'desconocido' : 'si',
  version_vulkan: vulkan,
})

const haswell = linux('8086:0412', null) // HD 4600, projected Vulkan 1.0–1.1
const kepler = windows('10de:128b') // GT 710, projected Vulkan 1.2
const rtx = linux('10de:2504', '1.4.318') // RTX 3060, measured
const noPci = linux(null, null)

const game = (apis: ReadonlyArray<GraphicsApi>, nivel_x86_min: X86Level | null = null) => ({ apis, nivel_x86_min })
const eldenRing = game(['d3d12'])
const witcher3 = game(['d3d11', 'd3d12'])
const cs2 = game(['vulkan', 'd3d11'], 'v2')

describe('gamePath', () => {
  it.each<[string, ColumnasEquipo, X86Level | null, ReturnType<typeof game>, GamePath]>([
    ['a D3D12 game on Haswell', haswell, 'v3', eldenRing, { status: 'sin_ruta', reason: 'grafica' }],
    ['a {D3D11, D3D12} game on Vulkan 1.2', kepler, null, witcher3, { status: 'con_ruta', path: 'dxvk_sarek' }],
    ['a D3D11 game with no PCI id and unknown Vulkan', noPci, 'v3', game(['d3d11']), { status: 'sin_datos', missing: ['grafica'], at_least: 'wined3d' }],
    ['a D3D12 game with no PCI id', noPci, 'v3', eldenRing, { status: 'sin_datos', missing: ['grafica'], at_least: null }],
    ['CS2 on an x86-64-v1 CPU', rtx, 'v1', cs2, { status: 'sin_ruta', reason: 'cpu' }],
    ['CS2 with the CPU level not captured', rtx, null, cs2, { status: 'sin_datos', missing: ['cpu'], at_least: 'vulkan' }],
    ['CS2 on a v2 CPU and Vulkan 1.4 runs on Vulkan, not DXVK', rtx, 'v2', cs2, { status: 'con_ruta', path: 'vulkan' }],
    ['CS2 on an old diagnosis that lacks both facts', noPci, null, cs2, { status: 'sin_datos', missing: ['grafica', 'cpu'], at_least: 'wined3d' }],
    ['CS2 on a v2 CPU and Vulkan 1.2', kepler, 'v2', cs2, { status: 'con_ruta', path: 'vulkan' }],
    ['an OpenGL game with nothing known', noPci, null, game(['opengl']), { status: 'con_ruta', path: 'opengl' }],
    ['a {D3D11, OpenGL} game on Haswell', haswell, null, game(['d3d11', 'opengl']), { status: 'con_ruta', path: 'opengl' }],
    ['a game with no APIs declared', rtx, 'v3', game([]), { status: 'sin_apis' }],
    ['a {D3D11, D3D12} game on Vulkan 1.4', rtx, 'v3', witcher3, { status: 'con_ruta', path: 'dxvk' }],
    ['a D3D12 game on Vulkan 1.4', rtx, 'v3', eldenRing, { status: 'con_ruta', path: 'vkd3d_proton' }],
    ['a Vulkan game on Ivy Bridge, which has no Vulkan', linux('8086:0166', null), 'v2', game(['vulkan']), { status: 'sin_ruta', reason: 'grafica' }],
    ['a {Vulkan, D3D9} game on Fermi', windows('10de:0de1'), null, game(['vulkan', 'd3d9']), { status: 'con_ruta', path: 'wined3d' }],
    ['a Vulkan game when Vulkan is unknown', noPci, null, game(['vulkan']), { status: 'sin_datos', missing: ['grafica'], at_least: null }],
  ])('%s', (_, columns, cpu, j, expected) => {
    expect(gamePath(equipoEnLinux(columns), cpu, j)).toEqual(expected)
  })
})
