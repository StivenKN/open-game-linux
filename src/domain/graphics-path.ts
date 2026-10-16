import { Array as Arr } from 'effect'
import { type RequirementCheck, vulkanStatus } from './evaluation.ts'
import type { MachineOnLinux, D3dPath } from './gpu.ts'
import type { GraphicsApi } from './literals.ts'
import { X86Level } from './platform.ts'

/**
 * Every way a game can reach the GPU on Linux, best first. This order alone picks between a game's
 * APIs. Native Vulkan needs no translation, so it leads. D3D11 sits above VKD3D on purpose: for a
 * {d3d11, d3d12} game the lighter path wins.
 */
export const RENDER_PATHS = ['vulkan', 'dxvk', 'dxvk_2', 'vkd3d_proton', 'opengl', 'dxvk_sarek', 'wined3d'] as const satisfies ReadonlyArray<
  D3dPath | 'vkd3d_proton' | 'vulkan' | 'opengl'
>
export type RenderPath = (typeof RENDER_PATHS)[number]

/** Paths that compile shaders asynchronously, which online anti-cheat can flag. Their label must carry a warning. */
export type AntiCheatRiskPath = Extract<RenderPath, 'dxvk_sarek'>

/** The fact a verdict rests on: the GPU's graphics path or the CPU's x86-64 level. */
export type Requirement = 'grafica' | 'cpu'

/**
 * Hardware-only verdict for one game: no reports involved. `sin_datos` lists every missing fact
 * (an old diagnosis can lack both) and `at_least` is the best path already certain.
 */
export type GamePath =
  | { readonly status: 'sin_apis' }
  | { readonly status: 'con_ruta'; readonly path: RenderPath }
  | { readonly status: 'sin_ruta'; readonly reason: Requirement }
  | { readonly status: 'sin_datos'; readonly missing: Arr.NonEmptyReadonlyArray<Requirement>; readonly at_least: RenderPath | null }

/** What one API gets on this machine: the best path we are sure of, and a better one we can't rule out. */
type Offer = { readonly certain: RenderPath | null; readonly possible: RenderPath | null }

// Unknown D3D support still leaves WineD3D, which needs no Vulkan.
const d3d9to11 = ({ paths }: MachineOnLinux): Offer => (paths === null ? { certain: 'wined3d', possible: 'dxvk' } : { certain: paths.d3d9_11, possible: null })

const nativeVulkan = {
  cumple: { certain: 'vulkan', possible: null },
  no_cumple: { certain: null, possible: null },
  desconocido: { certain: null, possible: 'vulkan' },
} as const satisfies Record<RequirementCheck['status'], Offer>

const OFFERS = {
  d3d9: d3d9to11,
  d3d10: d3d9to11,
  d3d11: d3d9to11,
  d3d12: ({ paths }) => (paths === null ? { certain: null, possible: 'vkd3d_proton' } : { certain: paths.d3d12 ? 'vkd3d_proton' : null, possible: null }),
  vulkan: ({ vulkan }) => nativeVulkan[vulkanStatus(vulkan, null)],
  opengl: () => ({ certain: 'opengl', possible: null }),
} as const satisfies Record<GraphicsApi, (machine: MachineOnLinux) => Offer>

const best = (paths: ReadonlyArray<RenderPath | null>): RenderPath | null => RENDER_PATHS.find((c) => paths.includes(c)) ?? null

const levelIndex = (n: X86Level) => X86Level.literals.indexOf(n)

/** `cpu` is the captured x86-64 level, null when the detector didn't read it. Windows captures get the same rules. */
export const gamePath = (
  machine: MachineOnLinux,
  cpu: X86Level | null,
  game: { readonly apis: ReadonlyArray<GraphicsApi>; readonly nivel_x86_min: X86Level | null },
): GamePath => {
  const minimum = game.nivel_x86_min
  if (minimum !== null && cpu !== null && levelIndex(cpu) < levelIndex(minimum)) return { status: 'sin_ruta', reason: 'cpu' }
  if (game.apis.length === 0) return { status: 'sin_apis' }
  const offers = game.apis.map((api) => OFFERS[api](machine))
  const certain = best(offers.map((o) => o.certain))
  const possible = best(offers.map((o) => o.possible))
  const cpuMissing = minimum !== null && cpu === null ? (['cpu'] as const) : []
  // A certain "no path" outranks a CPU level we don't know.
  if (certain === null) return possible === null ? { status: 'sin_ruta', reason: 'grafica' } : { status: 'sin_datos', missing: ['grafica', ...cpuMissing], at_least: null }
  const missing = [...(possible !== null && RENDER_PATHS.indexOf(possible) < RENDER_PATHS.indexOf(certain) ? (['grafica'] as const) : []), ...cpuMissing]
  return Arr.isReadonlyArrayNonEmpty(missing) ? { status: 'sin_datos', missing, at_least: certain } : { status: 'con_ruta', path: certain }
}
