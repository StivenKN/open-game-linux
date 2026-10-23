import type { GpuFamily, GpuVendor } from '../src/domain/gpu.ts'
import { encodeSpans } from '../src/server/gpu/ranges.ts'

export type Device = { readonly vendor: GpuVendor; readonly device: string; readonly family: GpuFamily }

const hex4 = (s: string) => s.toLowerCase().padStart(4, '0')

export const mesaChipsets = (text: string, source: string): ReadonlyArray<{ readonly device: string; readonly token: string }> =>
  text.split('\n').flatMap((line, i) => {
    if (line.trim() === '') return []
    const m = /^CHIPSET\(0x([0-9a-fA-F]{1,4}),\s*([A-Za-z0-9_]+)\s*,/.exec(line)
    if (m?.[1] === undefined || m[2] === undefined) throw new Error(`${source}:${i + 1}: unreadable line «${line}»`)
    return [{ device: hex4(m[1]), token: m[2] }]
  })

const byRules = (source: string, token: string, rules: ReadonlyArray<readonly [RegExp, GpuFamily]>, fallback?: GpuFamily): GpuFamily => {
  const family = rules.find(([re]) => re.test(token))?.[1] ?? fallback
  if (family === undefined) throw new Error(`${source}: unknown token «${token}»; add its family to scripts/gpu-sources.ts`)
  return family
}

export const crocusFamily = (token: string): GpuFamily =>
  byRules('crocus', token, [
    [/^(i965|g4x|ilk)$/, 'intel_gen5_o_anterior'],
    [/^snb_/, 'intel_gen6'],
    [/^(ivb_|byt$)/, 'intel_gen7'],
    [/^hsw_/, 'intel_gen7_5'],
    [/^chv$/, 'intel_gen8'],
  ])

/** iris starts at Broadwell; every later platform (and any new token) is gen9 or newer. */
export const irisFamily = (token: string): GpuFamily =>
  byRules('iris', token, [[/^(bdw_|chv$)/, 'intel_gen8']], 'intel_gen9_o_posterior')

const amdgpuChips = {
  TAHITI: 'amd_gcn1',
  PITCAIRN: 'amd_gcn1',
  VERDE: 'amd_gcn1',
  OLAND: 'amd_gcn1',
  HAINAN: 'amd_gcn1',
  BONAIRE: 'amd_gcn2',
  HAWAII: 'amd_gcn2',
  KAVERI: 'amd_gcn2',
  KABINI: 'amd_gcn2',
  MULLINS: 'amd_gcn2',
  TOPAZ: 'amd_gcn3_o_posterior',
  TONGA: 'amd_gcn3_o_posterior',
  FIJI: 'amd_gcn3_o_posterior',
  CARRIZO: 'amd_gcn3_o_posterior',
  STONEY: 'amd_gcn3_o_posterior',
  POLARIS10: 'amd_gcn3_o_posterior',
  POLARIS11: 'amd_gcn3_o_posterior',
  POLARIS12: 'amd_gcn3_o_posterior',
  VEGAM: 'amd_gcn3_o_posterior',
  VEGA10: 'amd_gcn3_o_posterior',
  VEGA12: 'amd_gcn3_o_posterior',
  VEGA20: 'amd_gcn3_o_posterior',
  RAVEN: 'amd_gcn3_o_posterior',
  ARCTURUS: 'amd_gcn3_o_posterior',
  RENOIR: 'amd_gcn3_o_posterior',
  ALDEBARAN: 'amd_gcn3_o_posterior',
  CYAN_SKILLFISH: 'amd_gcn3_o_posterior',
  NAVI10: 'amd_gcn3_o_posterior',
  NAVI12: 'amd_gcn3_o_posterior',
  NAVI14: 'amd_gcn3_o_posterior',
  SIENNA_CICHLID: 'amd_gcn3_o_posterior',
  NAVY_FLOUNDER: 'amd_gcn3_o_posterior',
  DIMGREY_CAVEFISH: 'amd_gcn3_o_posterior',
  BEIGE_GOBY: 'amd_gcn3_o_posterior',
  YELLOW_CARP: 'amd_gcn3_o_posterior',
} as const satisfies Record<string, GpuFamily>

const isChip = (chip: string): chip is keyof typeof amdgpuChips => Object.hasOwn(amdgpuChips, chip)

/**
 * The explicit ids of `pciidlist[]`. Accepts both entry styles the kernel has used (`{0x1002, 0x6780, ...,
 * CHIP_X}` and `{ PCI_DEVICE(0x1002, 0x6780), .driver_data = CHIP_X }`). Class wildcards (`PCI_ANY_ID`,
 * the IP-discovery parts) carry no id and are skipped, so those GPUs get no projection.
 */
export const amdgpuIds = (text: string): ReadonlyArray<Device> => {
  const start = text.search(/^static const struct pci_device_id pciidlist\[\] = \{$/m)
  if (start === -1) throw new Error('amdgpu_drv.c: cannot find «static const struct pci_device_id pciidlist[] = {»')
  const end = text.indexOf('\n};', start)
  const body = text
    .slice(text.indexOf('{', start) + 1, end)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')
  const entries = body.split(/\}\s*,?/).map((e) => e.replace(/^[\s,]*\{/, '').trim())
  return entries.flatMap((e) => {
    if (e === '' || /^0,\s*0,\s*0$/.test(e)) return []
    if (/^(PCI_DEVICE\()?0x1002,\s*PCI_ANY_ID\b/.test(e)) return []
    const m = /^(?:PCI_DEVICE\()?0x1002,\s*0x([0-9a-fA-F]{4})\b[\s\S]*?\bCHIP_([A-Z0-9_]+)/.exec(e)
    if (m?.[1] === undefined || m[2] === undefined) throw new Error(`amdgpu_drv.c: unreadable entry «${e}»`)
    const chip = m[2]
    if (!isChip(chip)) throw new Error(`amdgpu_drv.c: unknown CHIP_${chip}; add its family to scripts/gpu-sources.ts`)
    return [{ vendor: '1002', device: hex4(m[1]), family: amdgpuChips[chip] }]
  })
}

const nvidiaCodenames: ReadonlyArray<readonly [RegExp, GpuFamily]> = [
  [/^GF\d/, 'nvidia_fermi'],
  [/^GK\d/, 'nvidia_kepler'],
  [/^G[MPV]\d/, 'nvidia_maxwell_a_volta'],
  [/^(TU|GA|AD|GB|GH)\d/, 'nvidia_turing_o_posterior'],
  [/^(G[0-9T]\d|NV\d|C\d)/, 'nvidia_tesla_o_anterior'],
]

// pci.ids names chipset and GPU functions with the same codename ("TU116 USB 3.1 Host Controller").
const notGpu = /\b(Audio|Bridge|bridge|Controller|PCIe host|USB|UCSI|SMBus|Ethernet|SATA|IDE)\b/

// The GPU lines of one vendor's block in pci.ids whose name starts with a codename the rules know.
const codenameIds =
  (vendor: GpuVendor, codenames: ReadonlyArray<readonly [RegExp, GpuFamily]>) =>
  (text: string): ReadonlyArray<Device> => {
    const lines = text.split('\n')
    const start = lines.findIndex((l) => l.startsWith(`${vendor}  `))
    if (start === -1) throw new Error(`pci.ids: cannot find vendor ${vendor}`)
    const devices: Array<Device> = []
    for (const [i, line] of lines.slice(start + 1).entries()) {
      if (/^([0-9a-f]{4}  |C )/.test(line)) break
      if (line.trim() === '' || line.startsWith('#') || /^\t\t[0-9a-f]{4} [0-9a-f]{4}  /.test(line)) continue
      const m = /^\t([0-9a-f]{4})  (.+)$/.exec(line)
      if (m?.[1] === undefined || m[2] === undefined) throw new Error(`pci.ids:${start + i + 2}: unreadable line «${line}»`)
      const name = m[2]
      if (notGpu.test(name.replace(/\[[^\]]*\]/g, ''))) continue
      const family = codenames.find(([re]) => re.test(name))?.[1]
      if (family !== undefined) devices.push({ vendor, device: m[1], family })
    }
    return devices
  }

export const nvidiaIds = codenameIds('10de', nvidiaCodenames)

/**
 * amdgpu matches its IP-discovery parts by PCI class, so amdgpu_drv.c names no id for them, and pci.ids names
 * them by codename. Only the Steam Deck's APUs are taken from there (Van Gogh in the LCD model, Sephiroth in
 * the OLED one, both RDNA 2); the rest stay unprojected (RATIONALE, U10, risk 5).
 */
export const amdApuIds = codenameIds('1002', [[/^(VanGogh|Sephiroth)\b/, 'amd_gcn3_o_posterior']])

export const withFloor = <A>(source: string, floor: number, ids: ReadonlyArray<A>): ReadonlyArray<A> => {
  if (ids.length < floor) throw new Error(`${source}: ${ids.length} ids, under the floor of ${floor}; did the format change?`)
  return ids
}

export type Table = Record<GpuVendor, Partial<Record<GpuFamily, string>>>

export const tableOf = (devices: ReadonlyArray<Device>): Table => {
  const unique = new Map<string, Device>()
  for (const d of devices) {
    const key = `${d.vendor}:${d.device}`
    const previous = unique.get(key)?.family
    if (previous !== undefined && previous !== d.family) throw new Error(`${key} appears as both ${previous} and ${d.family}`)
    unique.set(key, d)
  }
  const groups = new Map<string, { readonly vendor: GpuVendor; readonly family: GpuFamily; readonly numbers: Array<number> }>()
  for (const d of unique.values()) {
    const key = `${d.vendor} ${d.family}`
    const group = groups.get(key) ?? { vendor: d.vendor, family: d.family, numbers: [] }
    group.numbers.push(parseInt(d.device, 16))
    groups.set(key, group)
  }
  const table: Table = { '8086': {}, '1002': {}, '10de': {} }
  for (const g of groups.values()) table[g.vendor][g.family] = encodeSpans(g.numbers)
  return table
}
