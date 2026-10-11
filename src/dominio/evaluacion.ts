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

export type Vulkan =
  | { readonly soporte: 'si'; readonly version: VersionVulkan | null }
  | { readonly soporte: 'no' }
  | { readonly soporte: 'desconocido' }

export type Capacidades = {
  readonly sistema: Sistema
  readonly ram_mb: number
  readonly vram_mb: number | null
  readonly vulkan: Vulkan
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
  readonly detectado: string | null
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
      detectado: String(equipo.ram_mb),
    })
  if (perfil.vram_min_mb !== null)
    comprobaciones.push({
      requisito: 'vram',
      estado: equipo.vram_mb === null ? 'desconocido' : equipo.vram_mb >= perfil.vram_min_mb ? 'cumple' : 'no_cumple',
      exigido: String(perfil.vram_min_mb),
      detectado: equipo.vram_mb === null ? null : String(equipo.vram_mb),
    })
  if (perfil.requiere_vulkan === true)
    comprobaciones.push({
      requisito: 'vulkan',
      estado: estadoVulkan(equipo.vulkan, perfil.version_vulkan_min),
      exigido: perfil.version_vulkan_min?.texto ?? 'si',
      detectado: equipo.vulkan.soporte === 'si' ? (equipo.vulkan.version?.texto ?? 'si') : equipo.vulkan.soporte === 'no' ? 'no' : null,
    })
  const veredicto: VeredictoRequisitos = comprobaciones.some((c) => c.estado === 'no_cumple')
    ? 'no_cumple'
    : comprobaciones.length === 0 || comprobaciones.some((c) => c.estado === 'desconocido')
      ? 'informacion_insuficiente'
      : 'cumple'
  return { veredicto, comprobaciones, solo_orientativa: equipo.sistema === 'Windows' }
}

const estadoVulkan = (vulkan: Vulkan, minimo: VersionVulkan | null): Comprobacion['estado'] => {
  if (vulkan.soporte === 'no') return 'no_cumple'
  if (vulkan.soporte === 'desconocido') return 'desconocido'
  if (minimo === null) return 'cumple'
  if (vulkan.version === null) return 'desconocido'
  return alMenos(vulkan.version, minimo) ? 'cumple' : 'no_cumple'
}

export type ColumnasCapacidad = {
  readonly sistema: Sistema
  readonly ram_mb: number
  readonly vram_mb: number | null
  readonly soporte_vulkan: SoporteVulkan
  readonly version_vulkan: string | null
}

export const capacidades = (c: ColumnasCapacidad): Capacidades => ({
  sistema: c.sistema,
  ram_mb: c.ram_mb,
  vram_mb: c.vram_mb,
  vulkan:
    c.soporte_vulkan === 'si'
      ? { soporte: 'si', version: versionVulkan(c.version_vulkan) }
      : { soporte: c.soporte_vulkan },
})

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
