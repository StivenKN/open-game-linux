import { Schema } from 'effect'

export const Sistema = Schema.Literals(['Linux', 'Windows'])
export type Sistema = typeof Sistema.Type

export const SoporteVulkan = Schema.Literals(['si', 'no', 'desconocido'])
export type SoporteVulkan = typeof SoporteVulkan.Type

export type VersionVulkan = { readonly texto: string; readonly partes: readonly [number, ...number[]] }

export const versionVulkan = (texto: string | null): VersionVulkan | null => {
  if (texto === null || !/^\d+(\.\d+)*$/.test(texto)) return null
  const [mayor, ...resto] = texto.split('.').map(Number)
  return mayor === undefined ? null : { texto, partes: [mayor, ...resto] }
}

export const alMenos = (v: VersionVulkan, minimo: VersionVulkan): boolean => {
  for (let i = 0; i < Math.max(v.partes.length, minimo.partes.length); i++) {
    const diferencia = (v.partes[i] ?? 0) - (minimo.partes[i] ?? 0)
    if (diferencia !== 0) return diferencia > 0
  }
  return true
}

export type OrigenDato = 'medido' | 'proyectado'

export type RangoVulkan = { readonly desde: VersionVulkan; readonly hasta: VersionVulkan }

/**
 * `medido` is vulkaninfo on this Linux machine: its version is a one-point range, and support it reported
 * without a version has `rango: null`. `proyectado` is what the GPU's family reaches on Linux, a wider range
 * when the level is not verified. A projection is never presented as a measurement.
 */
export type VulkanEquipo =
  | { readonly soporte: 'si'; readonly origen: OrigenDato; readonly rango: RangoVulkan | null }
  | { readonly soporte: 'no'; readonly origen: OrigenDato }
  | { readonly soporte: 'desconocido' }

export type Capacidades = {
  readonly sistema: Sistema
  readonly ram_mb: number
  readonly vram_mb: number | null
  readonly vulkan: VulkanEquipo
}

export type CondicionesConocidas = {
  readonly ram_min_mb: number | null
  readonly vram_min_mb: number | null
  readonly requiere_vulkan: boolean | null
  readonly version_vulkan_min: VersionVulkan | null
}

export const VeredictoRequisitos = Schema.Literals(['no_cumple', 'informacion_insuficiente', 'cumple'])
export type VeredictoRequisitos = typeof VeredictoRequisitos.Type

export type Comprobacion = {
  readonly requisito: 'ram' | 'vram' | 'vulkan'
  readonly estado: 'cumple' | 'no_cumple' | 'desconocido'
  readonly exigido: string
  /** Null when the machine's value is unknown, so an unknown value carries no origin. */
  readonly detectado: { readonly valor: string; readonly origen: OrigenDato } | null
}

export type Evaluacion = {
  readonly veredicto: VeredictoRequisitos
  readonly comprobaciones: ReadonlyArray<Comprobacion>
  readonly solo_orientativa: boolean
}

export const evaluar = (equipo: Capacidades, perfil: CondicionesConocidas): Evaluacion => {
  const comprobaciones: Array<Comprobacion> = []
  if (perfil.ram_min_mb !== null)
    comprobaciones.push({
      requisito: 'ram',
      estado: equipo.ram_mb >= perfil.ram_min_mb ? 'cumple' : 'no_cumple',
      exigido: String(perfil.ram_min_mb),
      detectado: { valor: String(equipo.ram_mb), origen: 'medido' },
    })
  if (perfil.vram_min_mb !== null)
    comprobaciones.push({
      requisito: 'vram',
      estado: equipo.vram_mb === null ? 'desconocido' : equipo.vram_mb >= perfil.vram_min_mb ? 'cumple' : 'no_cumple',
      exigido: String(perfil.vram_min_mb),
      detectado: equipo.vram_mb === null ? null : { valor: String(equipo.vram_mb), origen: 'medido' },
    })
  if (perfil.requiere_vulkan === true)
    comprobaciones.push({
      requisito: 'vulkan',
      estado: estadoVulkan(equipo.vulkan, perfil.version_vulkan_min),
      exigido: perfil.version_vulkan_min?.texto ?? 'si',
      detectado: equipo.vulkan.soporte === 'desconocido' ? null : { valor: valorVulkan(equipo.vulkan), origen: equipo.vulkan.origen },
    })
  const veredicto: VeredictoRequisitos = comprobaciones.some((c) => c.estado === 'no_cumple')
    ? 'no_cumple'
    : comprobaciones.length === 0 || comprobaciones.some((c) => c.estado === 'desconocido')
      ? 'informacion_insuficiente'
      : 'cumple'
  return { veredicto, comprobaciones, solo_orientativa: equipo.sistema === 'Windows' }
}

/** A range that straddles the minimum is `desconocido`: an unverified level never yields a false `cumple`. */
const estadoVulkan = (vulkan: VulkanEquipo, minimo: VersionVulkan | null): Comprobacion['estado'] => {
  if (vulkan.soporte !== 'si') return vulkan.soporte === 'no' ? 'no_cumple' : 'desconocido'
  if (minimo === null) return 'cumple'
  if (vulkan.rango === null) return 'desconocido'
  if (alMenos(vulkan.rango.desde, minimo)) return 'cumple'
  return alMenos(vulkan.rango.hasta, minimo) ? 'desconocido' : 'no_cumple'
}

const valorVulkan = (vulkan: Exclude<VulkanEquipo, { readonly soporte: 'desconocido' }>): string =>
  vulkan.soporte === 'no' ? 'no' : vulkan.rango === null ? 'si' : rangoVulkan(vulkan.rango)

/** `"1.3–1.4"`, or `"1.2"` when the range is one version. */
export const rangoVulkan = (r: RangoVulkan): string =>
  r.desde.texto === r.hasta.texto ? r.desde.texto : `${r.desde.texto}–${r.hasta.texto}`

export type ColumnasCondicion = {
  readonly ram_min_mb: number | null
  readonly vram_min_mb: number | null
  readonly requiere_vulkan: boolean | null
  readonly version_vulkan_min: string | null
}

export const condiciones = (p: ColumnasCondicion): CondicionesConocidas => ({
  ram_min_mb: p.ram_min_mb,
  vram_min_mb: p.vram_min_mb,
  requiere_vulkan: p.requiere_vulkan,
  version_vulkan_min: versionVulkan(p.version_vulkan_min),
})

export const sugerirPerfil = <P extends { readonly distribucion_id: number; readonly arquitectura: string; readonly revision: number; readonly evaluacion: Evaluacion | null }>(
  perfiles: ReadonlyArray<P>,
  diagnostico: { readonly distribucion_id: number | null; readonly arquitectura: string },
): P | null => {
  const distinto = (p: P) => (p.distribucion_id === diagnostico.distribucion_id && p.arquitectura === diagnostico.arquitectura ? 0 : 1)
  const veredicto = (p: P) => rangoVeredicto[p.evaluacion?.veredicto ?? 'informacion_insuficiente']
  const comparar = (a: P, b: P) => distinto(a) - distinto(b) || veredicto(a) - veredicto(b) || b.revision - a.revision
  return perfiles.reduce<P | null>((mejor, p) => (mejor === null || comparar(p, mejor) < 0 ? p : mejor), null)
}

const rangoVeredicto = { cumple: 0, informacion_insuficiente: 1, no_cumple: 2 } as const satisfies Record<VeredictoRequisitos, number>
