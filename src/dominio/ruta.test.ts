import { describe, expect, it } from '@effect/vitest'
import { Schema } from 'effect'
import { type ColumnasEquipo, equipoEnLinux } from '../servidor/gpu/capacidad.ts'
import { PciId } from './gpu.ts'
import type { ApiGrafica } from './literales.ts'
import type { NivelX86 } from './plataforma.ts'
import { type RutaJuego, rutaJuego } from './ruta.ts'

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
const sinPci = linux(null, null)

const juego = (apis: ReadonlyArray<ApiGrafica>, nivel_x86_min: NivelX86 | null = null) => ({ apis, nivel_x86_min })
const eldenRing = juego(['d3d12'])
const witcher3 = juego(['d3d11', 'd3d12'])
const cs2 = juego(['vulkan', 'd3d11'], 'v2')

describe('rutaJuego', () => {
  it.each<[string, ColumnasEquipo, NivelX86 | null, ReturnType<typeof juego>, RutaJuego]>([
    ['a D3D12 game on Haswell', haswell, 'v3', eldenRing, { estado: 'sin_ruta', motivo: 'grafica' }],
    ['a {D3D11, D3D12} game on Vulkan 1.2', kepler, null, witcher3, { estado: 'con_ruta', camino: 'dxvk_sarek' }],
    ['a D3D11 game with no PCI id and unknown Vulkan', sinPci, 'v3', juego(['d3d11']), { estado: 'sin_datos', faltan: ['grafica'], al_menos: 'wined3d' }],
    ['a D3D12 game with no PCI id', sinPci, 'v3', eldenRing, { estado: 'sin_datos', faltan: ['grafica'], al_menos: null }],
    ['CS2 on an x86-64-v1 CPU', rtx, 'v1', cs2, { estado: 'sin_ruta', motivo: 'cpu' }],
    ['CS2 with the CPU level not captured', rtx, null, cs2, { estado: 'sin_datos', faltan: ['cpu'], al_menos: 'vulkan' }],
    ['CS2 on a v2 CPU and Vulkan 1.4 runs on Vulkan, not DXVK', rtx, 'v2', cs2, { estado: 'con_ruta', camino: 'vulkan' }],
    ['CS2 on an old diagnosis that lacks both facts', sinPci, null, cs2, { estado: 'sin_datos', faltan: ['grafica', 'cpu'], al_menos: 'wined3d' }],
    ['CS2 on a v2 CPU and Vulkan 1.2', kepler, 'v2', cs2, { estado: 'con_ruta', camino: 'vulkan' }],
    ['an OpenGL game with nothing known', sinPci, null, juego(['opengl']), { estado: 'con_ruta', camino: 'opengl' }],
    ['a {D3D11, OpenGL} game on Haswell', haswell, null, juego(['d3d11', 'opengl']), { estado: 'con_ruta', camino: 'opengl' }],
    ['a game with no APIs declared', rtx, 'v3', juego([]), { estado: 'sin_apis' }],
    ['a {D3D11, D3D12} game on Vulkan 1.4', rtx, 'v3', witcher3, { estado: 'con_ruta', camino: 'dxvk' }],
    ['a D3D12 game on Vulkan 1.4', rtx, 'v3', eldenRing, { estado: 'con_ruta', camino: 'vkd3d_proton' }],
    ['a Vulkan game on Ivy Bridge, which has no Vulkan', linux('8086:0166', null), 'v2', juego(['vulkan']), { estado: 'sin_ruta', motivo: 'grafica' }],
    ['a {Vulkan, D3D9} game on Fermi', windows('10de:0de1'), null, juego(['vulkan', 'd3d9']), { estado: 'con_ruta', camino: 'wined3d' }],
    ['a Vulkan game when Vulkan is unknown', sinPci, null, juego(['vulkan']), { estado: 'sin_datos', faltan: ['grafica'], al_menos: null }],
  ])('%s', (_, columnas, cpu, j, esperado) => {
    expect(rutaJuego(equipoEnLinux(columnas), cpu, j)).toEqual(esperado)
  })
})
