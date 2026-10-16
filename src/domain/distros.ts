import { Record } from 'effect'
import type { EquipoEnLinux, FamiliaGpu } from './gpu.ts'

/**
 * Only facts we can source. `desconocido` is a value, not a gap: a rule that meets it raises an
 * adjustment telling the user to check, never a silent pass.
 */
type Distro = {
  readonly clave: string
  readonly nombre: string
  readonly url: string
  /** `kernel_6_8`: its shipped kernel is 6.8, where Kepler keeps the 470 driver. */
  readonly kepler: 'sin_soporte' | 'kernel_6_8' | 'desconocido'
  /** `kernel_hwe`: its HWE kernel (7.0) is past 6.19, where amdgpu drives GCN 1/2 by default. */
  readonly gcn: 'kernel_hwe' | 'desconocido'
  /** How Maxwell to Volta get branch 580, their last. */
  readonly rama_580: 'paquete_580xx' | 'imagen_nvidia' | 'desconocido'
}

/** Display order only: never a ranking. Mint 22 is based on Ubuntu 24.04, whose GA kernel is 6.8. */
const DISTROS = [
  { clave: 'mint_22', nombre: 'Linux Mint 22', url: 'https://linuxmint.com', kepler: 'kernel_6_8', gcn: 'desconocido', rama_580: 'desconocido' },
  { clave: 'ubuntu_2404', nombre: 'Ubuntu 24.04 LTS', url: 'https://ubuntu.com', kepler: 'kernel_6_8', gcn: 'kernel_hwe', rama_580: 'desconocido' },
  { clave: 'fedora', nombre: 'Fedora', url: 'https://fedoraproject.org', kepler: 'desconocido', gcn: 'desconocido', rama_580: 'desconocido' },
  { clave: 'bazzite', nombre: 'Bazzite', url: 'https://bazzite.gg', kepler: 'sin_soporte', gcn: 'desconocido', rama_580: 'imagen_nvidia' },
  { clave: 'cachyos', nombre: 'CachyOS', url: 'https://cachyos.org', kepler: 'desconocido', gcn: 'desconocido', rama_580: 'desconocido' },
  { clave: 'arch', nombre: 'Arch Linux', url: 'https://archlinux.org', kepler: 'desconocido', gcn: 'desconocido', rama_580: 'paquete_580xx' },
] as const satisfies ReadonlyArray<Distro>

export type ClaveDistro = (typeof DISTROS)[number]['clave']

/** Why a distro is ruled out or needs a step. Each carries the distro fact the advice depends on. */
export type Objecion =
  | { readonly codigo: 'arquitectura'; readonly tiene: string }
  | { readonly codigo: 'kepler_sin_soporte' }
  | { readonly codigo: 'kepler_470'; readonly salida: Exclude<Distro['kepler'], 'sin_soporte'> }
  | { readonly codigo: 'rama_580'; readonly como: Distro['rama_580'] }
  | { readonly codigo: 'gcn_amdgpu'; readonly como: Distro['gcn'] }
  | { readonly codigo: 'gpu_desconocida' }

export type CodigoObjecion = Objecion['codigo']

/** `sin_objeciones` means we found no reason against it, not that it is the best. */
export type VeredictoDistro = 'descartada' | 'con_ajustes' | 'sin_objeciones'

export type DistroEvaluada = {
  readonly clave: ClaveDistro
  readonly nombre: string
  readonly url: string
  readonly veredicto: VeredictoDistro
  readonly objeciones: ReadonlyArray<Objecion>
}

type Hechos = { readonly familia: FamiliaGpu | null; readonly arquitectura: string }

type Regla<K extends CodigoObjecion> = {
  readonly descarta: boolean
  readonly objetar: (d: Distro, h: Hechos) => Extract<Objecion, { readonly codigo: K }> | null
}

const REGLAS: { readonly [K in CodigoObjecion]: Regla<K> } = {
  // Steam and Proton need x86_64.
  arquitectura: { descarta: true, objetar: (_, h) => (h.arquitectura === 'x86_64' ? null : { codigo: 'arquitectura', tiene: h.arquitectura }) },
  kepler_sin_soporte: { descarta: true, objetar: (d, h) => (h.familia === 'nvidia_kepler' && d.kepler === 'sin_soporte' ? { codigo: 'kepler_sin_soporte' } : null) },
  kepler_470: { descarta: false, objetar: (d, h) => (h.familia === 'nvidia_kepler' && d.kepler !== 'sin_soporte' ? { codigo: 'kepler_470', salida: d.kepler } : null) },
  rama_580: { descarta: false, objetar: (d, h) => (h.familia === 'nvidia_maxwell_a_volta' ? { codigo: 'rama_580', como: d.rama_580 } : null) },
  gcn_amdgpu: { descarta: false, objetar: (d, h) => (h.familia === 'amd_gcn1' || h.familia === 'amd_gcn2' ? { codigo: 'gcn_amdgpu', como: d.gcn } : null) },
  // Without a known family no driver rule could run, so nothing may pass silently.
  gpu_desconocida: { descarta: false, objetar: (_, h) => (h.familia === null ? { codigo: 'gpu_desconocida' } : null) },
}

/** Every candidate in registry order with what the hardware says against it. Windows captures get the same rules. */
export const descartarDistros = (equipo: EquipoEnLinux, arquitectura: string): ReadonlyArray<DistroEvaluada> => {
  const hechos = { familia: equipo.gpu?.familia ?? null, arquitectura }
  return DISTROS.map((d) => {
    const objeciones = Record.values(REGLAS).flatMap((r) => r.objetar(d, hechos) ?? [])
    const veredicto: VeredictoDistro = objeciones.some((o) => REGLAS[o.codigo].descarta)
      ? 'descartada'
      : objeciones.length > 0
        ? 'con_ajustes'
        : 'sin_objeciones'
    return { clave: d.clave, nombre: d.nombre, url: d.url, veredicto, objeciones }
  })
}
