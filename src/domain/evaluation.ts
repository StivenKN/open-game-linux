import { Schema } from 'effect'

export const OperatingSystem = Schema.Literals(['Linux', 'Windows'])
export type OperatingSystem = typeof OperatingSystem.Type

export const VulkanSupport = Schema.Literals(['si', 'no', 'desconocido'])
export type VulkanSupport = typeof VulkanSupport.Type

export type VulkanVersion = { readonly text: string; readonly parts: readonly [number, ...number[]] }

export const vulkanVersion = (text: string | null): VulkanVersion | null => {
  if (text === null || !/^\d+(\.\d+)*$/.test(text)) return null
  const [major, ...rest] = text.split('.').map(Number)
  return major === undefined ? null : { text, parts: [major, ...rest] }
}

export const atLeast = (v: VulkanVersion, minimum: VulkanVersion): boolean => {
  for (let i = 0; i < Math.max(v.parts.length, minimum.parts.length); i++) {
    const difference = (v.parts[i] ?? 0) - (minimum.parts[i] ?? 0)
    if (difference !== 0) return difference > 0
  }
  return true
}

export type DataOrigin = 'medido' | 'proyectado'

export type VulkanRange = { readonly from: VulkanVersion; readonly to: VulkanVersion }

export type MachineVulkan =
  | { readonly support: 'si'; readonly origin: DataOrigin; readonly range: VulkanRange | null }
  | { readonly support: 'no'; readonly origin: DataOrigin }
  | { readonly support: 'desconocido' }

export type Capabilities = {
  readonly sistema: OperatingSystem
  readonly ram_mb: number
  readonly vram_mb: number | null
  readonly vulkan: MachineVulkan
}

export type KnownRequirements = {
  readonly ram_min_mb: number | null
  readonly vram_min_mb: number | null
  readonly requiere_vulkan: boolean | null
  readonly version_vulkan_min: VulkanVersion | null
}

export const RequirementsVerdict = Schema.Literals(['no_cumple', 'informacion_insuficiente', 'cumple'])
export type RequirementsVerdict = typeof RequirementsVerdict.Type

export type RequirementCheck = {
  readonly requirement: 'ram' | 'vram' | 'vulkan'
  readonly status: 'cumple' | 'no_cumple' | 'desconocido'
  readonly required: string
  readonly detected: { readonly value: string; readonly origin: DataOrigin } | null
}

export type Evaluation = {
  readonly verdict: RequirementsVerdict
  readonly checks: ReadonlyArray<RequirementCheck>
  readonly advisory_only: boolean
}

export const evaluate = (machine: Capabilities, profile: KnownRequirements): Evaluation => {
  const checks: Array<RequirementCheck> = []
  if (profile.ram_min_mb !== null)
    checks.push({
      requirement: 'ram',
      status: machine.ram_mb >= profile.ram_min_mb ? 'cumple' : 'no_cumple',
      required: String(profile.ram_min_mb),
      detected: { value: String(machine.ram_mb), origin: 'medido' },
    })
  if (profile.vram_min_mb !== null)
    checks.push({
      requirement: 'vram',
      status: machine.vram_mb === null ? 'desconocido' : machine.vram_mb >= profile.vram_min_mb ? 'cumple' : 'no_cumple',
      required: String(profile.vram_min_mb),
      detected: machine.vram_mb === null ? null : { value: String(machine.vram_mb), origin: 'medido' },
    })
  if (profile.requiere_vulkan === true)
    checks.push({
      requirement: 'vulkan',
      status: vulkanStatus(machine.vulkan, profile.version_vulkan_min),
      required: profile.version_vulkan_min?.text ?? 'si',
      detected: machine.vulkan.support === 'desconocido' ? null : { value: vulkanValue(machine.vulkan), origin: machine.vulkan.origin },
    })
  const verdict: RequirementsVerdict = checks.some((c) => c.status === 'no_cumple')
    ? 'no_cumple'
    : checks.length === 0 || checks.some((c) => c.status === 'desconocido')
      ? 'informacion_insuficiente'
      : 'cumple'
  return { verdict, checks, advisory_only: machine.sistema === 'Windows' }
}

export const vulkanStatus = (vulkan: MachineVulkan, minimum: VulkanVersion | null): RequirementCheck['status'] => {
  if (vulkan.support !== 'si') return vulkan.support === 'no' ? 'no_cumple' : 'desconocido'
  if (minimum === null) return 'cumple'
  if (vulkan.range === null) return 'desconocido'
  if (atLeast(vulkan.range.from, minimum)) return 'cumple'
  return atLeast(vulkan.range.to, minimum) ? 'desconocido' : 'no_cumple'
}

const vulkanValue = (vulkan: Exclude<MachineVulkan, { readonly support: 'desconocido' }>): string =>
  vulkan.support === 'no' ? 'no' : vulkan.range === null ? 'si' : vulkanRangeText(vulkan.range)

export const vulkanRangeText = (r: VulkanRange): string =>
  r.from.text === r.to.text ? r.from.text : `${r.from.text}–${r.to.text}`

export type RequirementColumns = {
  readonly ram_min_mb: number | null
  readonly vram_min_mb: number | null
  readonly requiere_vulkan: boolean | null
  readonly version_vulkan_min: string | null
}

export const requirements = (p: RequirementColumns): KnownRequirements => ({
  ram_min_mb: p.ram_min_mb,
  vram_min_mb: p.vram_min_mb,
  requiere_vulkan: p.requiere_vulkan,
  version_vulkan_min: vulkanVersion(p.version_vulkan_min),
})

export const suggestProfile = <P extends { readonly distribucion_id: number; readonly arquitectura: string; readonly revision: number; readonly evaluacion: Evaluation | null }>(
  profiles: ReadonlyArray<P>,
  diagnostic: { readonly distribucion_id: number | null; readonly arquitectura: string },
): P | null => {
  const differs = (p: P) => (p.distribucion_id === diagnostic.distribucion_id && p.arquitectura === diagnostic.arquitectura ? 0 : 1)
  const rankOf = (p: P) => verdictRank[p.evaluacion?.verdict ?? 'informacion_insuficiente']
  const compare = (a: P, b: P) => differs(a) - differs(b) || rankOf(a) - rankOf(b) || b.revision - a.revision
  return profiles.reduce<P | null>((best, p) => (best === null || compare(p, best) < 0 ? p : best), null)
}

const verdictRank = { cumple: 0, informacion_insuficiente: 1, no_cumple: 2 } as const satisfies Record<RequirementsVerdict, number>
