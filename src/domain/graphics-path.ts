import { Array as Arr } from 'effect'
import { type Comprobacion, estadoVulkan } from './evaluation.ts'
import type { EquipoEnLinux, RutaD3d } from './gpu.ts'
import type { ApiGrafica } from './literals.ts'
import { NivelX86 } from './platform.ts'

/**
 * Every way a game can reach the GPU on Linux, best first. This order alone picks between a game's
 * APIs. Native Vulkan needs no translation, so it leads. D3D11 sits above VKD3D on purpose: for a
 * {d3d11, d3d12} game the lighter path wins.
 */
export const CAMINOS = ['vulkan', 'dxvk', 'dxvk_2', 'vkd3d_proton', 'opengl', 'dxvk_sarek', 'wined3d'] as const satisfies ReadonlyArray<
  RutaD3d | 'vkd3d_proton' | 'vulkan' | 'opengl'
>
export type Camino = (typeof CAMINOS)[number]

/** Paths that compile shaders asynchronously, which online anti-cheat can flag. Their label must carry a warning. */
export type CaminoSinAntiTrampas = Extract<Camino, 'dxvk_sarek'>

/** The fact a verdict rests on: the GPU's graphics path or the CPU's x86-64 level. */
export type Requisito = 'grafica' | 'cpu'

/**
 * Hardware-only verdict for one game: no reports involved. `sin_datos` lists every missing fact
 * (an old diagnosis can lack both) and `al_menos` is the best path already certain.
 */
export type RutaJuego =
  | { readonly estado: 'sin_apis' }
  | { readonly estado: 'con_ruta'; readonly camino: Camino }
  | { readonly estado: 'sin_ruta'; readonly motivo: Requisito }
  | { readonly estado: 'sin_datos'; readonly faltan: Arr.NonEmptyReadonlyArray<Requisito>; readonly al_menos: Camino | null }

/** What one API gets on this machine: the best path we are sure of, and a better one we can't rule out. */
type Oferta = { readonly segura: Camino | null; readonly posible: Camino | null }

// Unknown D3D support still leaves WineD3D, which needs no Vulkan.
const d3d9a11 = ({ ruta }: EquipoEnLinux): Oferta => (ruta === null ? { segura: 'wined3d', posible: 'dxvk' } : { segura: ruta.d3d9_11, posible: null })

const vulkanNativo = {
  cumple: { segura: 'vulkan', posible: null },
  no_cumple: { segura: null, posible: null },
  desconocido: { segura: null, posible: 'vulkan' },
} as const satisfies Record<Comprobacion['estado'], Oferta>

const OFERTA = {
  d3d9: d3d9a11,
  d3d10: d3d9a11,
  d3d11: d3d9a11,
  d3d12: ({ ruta }) => (ruta === null ? { segura: null, posible: 'vkd3d_proton' } : { segura: ruta.d3d12 ? 'vkd3d_proton' : null, posible: null }),
  vulkan: ({ vulkan }) => vulkanNativo[estadoVulkan(vulkan, null)],
  opengl: () => ({ segura: 'opengl', posible: null }),
} as const satisfies Record<ApiGrafica, (equipo: EquipoEnLinux) => Oferta>

const mejor = (caminos: ReadonlyArray<Camino | null>): Camino | null => CAMINOS.find((c) => caminos.includes(c)) ?? null

const nivel = (n: NivelX86) => NivelX86.literals.indexOf(n)

/** `cpu` is the captured x86-64 level, null when the detector didn't read it. Windows captures get the same rules. */
export const rutaJuego = (
  equipo: EquipoEnLinux,
  cpu: NivelX86 | null,
  juego: { readonly apis: ReadonlyArray<ApiGrafica>; readonly nivel_x86_min: NivelX86 | null },
): RutaJuego => {
  const minimo = juego.nivel_x86_min
  if (minimo !== null && cpu !== null && nivel(cpu) < nivel(minimo)) return { estado: 'sin_ruta', motivo: 'cpu' }
  if (juego.apis.length === 0) return { estado: 'sin_apis' }
  const ofertas = juego.apis.map((api) => OFERTA[api](equipo))
  const segura = mejor(ofertas.map((o) => o.segura))
  const posible = mejor(ofertas.map((o) => o.posible))
  const cpuFalta = minimo !== null && cpu === null ? (['cpu'] as const) : []
  // A certain "no path" outranks a CPU level we don't know.
  if (segura === null) return posible === null ? { estado: 'sin_ruta', motivo: 'grafica' } : { estado: 'sin_datos', faltan: ['grafica', ...cpuFalta], al_menos: null }
  const faltan = [...(posible !== null && CAMINOS.indexOf(posible) < CAMINOS.indexOf(segura) ? (['grafica'] as const) : []), ...cpuFalta]
  return Arr.isReadonlyArrayNonEmpty(faltan) ? { estado: 'sin_datos', faltan, al_menos: segura } : { estado: 'con_ruta', camino: segura }
}
