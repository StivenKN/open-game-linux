import { Record } from 'effect'
import type { MachineOnLinux, GpuFamily } from './gpu.ts'

/**
 * Only facts we can source. `desconocido` is a value, not a gap: a rule that meets it raises an
 * adjustment telling the user to check, never a silent pass.
 */
type Distro = {
  readonly key: string
  readonly name: string
  readonly url: string
  /** `kernel_6_8`: its shipped kernel is 6.8, where Kepler keeps the 470 driver. */
  readonly kepler: 'sin_soporte' | 'kernel_6_8' | 'desconocido'
  /** `kernel_hwe`: its HWE kernel (7.0) is past 6.19, where amdgpu drives GCN 1/2 by default. */
  readonly gcn: 'kernel_hwe' | 'desconocido'
  /** How Maxwell to Volta get branch 580, their last. */
  readonly branch_580: 'paquete_580xx' | 'imagen_nvidia' | 'desconocido'
}

/** Display order only: never a ranking. Mint 22 is based on Ubuntu 24.04, whose GA kernel is 6.8. */
const DISTROS = [
  { key: 'mint_22', name: 'Linux Mint 22', url: 'https://linuxmint.com', kepler: 'kernel_6_8', gcn: 'desconocido', branch_580: 'desconocido' },
  { key: 'ubuntu_2404', name: 'Ubuntu 24.04 LTS', url: 'https://ubuntu.com', kepler: 'kernel_6_8', gcn: 'kernel_hwe', branch_580: 'desconocido' },
  { key: 'fedora', name: 'Fedora', url: 'https://fedoraproject.org', kepler: 'desconocido', gcn: 'desconocido', branch_580: 'desconocido' },
  { key: 'bazzite', name: 'Bazzite', url: 'https://bazzite.gg', kepler: 'sin_soporte', gcn: 'desconocido', branch_580: 'imagen_nvidia' },
  { key: 'cachyos', name: 'CachyOS', url: 'https://cachyos.org', kepler: 'desconocido', gcn: 'desconocido', branch_580: 'desconocido' },
  { key: 'arch', name: 'Arch Linux', url: 'https://archlinux.org', kepler: 'desconocido', gcn: 'desconocido', branch_580: 'paquete_580xx' },
] as const satisfies ReadonlyArray<Distro>

export type DistroKey = (typeof DISTROS)[number]['key']

/** Why a distro is ruled out or needs a step. Each carries the distro fact the advice depends on. */
export type Objection =
  | { readonly code: 'arquitectura'; readonly has: string }
  | { readonly code: 'kepler_sin_soporte' }
  | { readonly code: 'kepler_470'; readonly kernel: Exclude<Distro['kepler'], 'sin_soporte'> }
  | { readonly code: 'rama_580'; readonly via: Distro['branch_580'] }
  | { readonly code: 'gcn_amdgpu'; readonly via: Distro['gcn'] }
  | { readonly code: 'gpu_desconocida' }

export type ObjectionCode = Objection['code']

/** `sin_objeciones` means we found no reason against it, not that it is the best. */
export type DistroVerdict = 'descartada' | 'con_ajustes' | 'sin_objeciones'

export type EvaluatedDistro = {
  readonly key: DistroKey
  readonly name: string
  readonly url: string
  readonly verdict: DistroVerdict
  readonly objections: ReadonlyArray<Objection>
}

type Facts = { readonly family: GpuFamily | null; readonly architecture: string }

type Rule<K extends ObjectionCode> = {
  readonly excludes: boolean
  readonly raise: (d: Distro, h: Facts) => Extract<Objection, { readonly code: K }> | null
}

const RULES: { readonly [K in ObjectionCode]: Rule<K> } = {
  // Steam and Proton need x86_64.
  arquitectura: { excludes: true, raise: (_, h) => (h.architecture === 'x86_64' ? null : { code: 'arquitectura', has: h.architecture }) },
  kepler_sin_soporte: { excludes: true, raise: (d, h) => (h.family === 'nvidia_kepler' && d.kepler === 'sin_soporte' ? { code: 'kepler_sin_soporte' } : null) },
  kepler_470: { excludes: false, raise: (d, h) => (h.family === 'nvidia_kepler' && d.kepler !== 'sin_soporte' ? { code: 'kepler_470', kernel: d.kepler } : null) },
  rama_580: { excludes: false, raise: (d, h) => (h.family === 'nvidia_maxwell_a_volta' ? { code: 'rama_580', via: d.branch_580 } : null) },
  gcn_amdgpu: { excludes: false, raise: (d, h) => (h.family === 'amd_gcn1' || h.family === 'amd_gcn2' ? { code: 'gcn_amdgpu', via: d.gcn } : null) },
  // Without a known family no driver rule could run, so nothing may pass silently.
  gpu_desconocida: { excludes: false, raise: (_, h) => (h.family === null ? { code: 'gpu_desconocida' } : null) },
}

/** Every candidate in registry order with what the hardware says against it. Windows captures get the same rules. */
export const screenDistros = (machine: MachineOnLinux, architecture: string): ReadonlyArray<EvaluatedDistro> => {
  const facts = { family: machine.gpu?.family ?? null, architecture }
  return DISTROS.map((d) => {
    const objections = Record.values(RULES).flatMap((r) => r.raise(d, facts) ?? [])
    const verdict: DistroVerdict = objections.some((o) => RULES[o.code].excludes)
      ? 'descartada'
      : objections.length > 0
        ? 'con_ajustes'
        : 'sin_objeciones'
    return { key: d.key, name: d.name, url: d.url, verdict, objections }
  })
}
