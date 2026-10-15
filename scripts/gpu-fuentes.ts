// Pure parsers for scripts/generar-gpus.ts. Each one fails closed: a line it cannot read, a token it has no
// rule for, or a source that yields fewer ids than its floor throws, so upstream drift stops the run instead
// of shipping a wrong or empty table.
import type { FamiliaGpu } from '../src/dominio/gpu.ts'

export type Vendor = '8086' | '1002' | '10de'
export type Dispositivo = { readonly vendor: Vendor; readonly device: string; readonly familia: FamiliaGpu }

const hex4 = (s: string) => s.toLowerCase().padStart(4, '0')

/** Mesa `include/pci_ids/*_pci_ids.h`: one `CHIPSET(0xdddd, token, ...)` per non-blank line. */
export const chipsetsMesa = (texto: string, fuente: string): ReadonlyArray<{ readonly device: string; readonly token: string }> =>
  texto.split('\n').flatMap((linea, i) => {
    if (linea.trim() === '') return []
    const m = /^CHIPSET\(0x([0-9a-fA-F]{1,4}),\s*([A-Za-z0-9_]+)\s*,/.exec(linea)
    if (m?.[1] === undefined || m[2] === undefined) throw new Error(`${fuente}:${i + 1}: línea ilegible «${linea}»`)
    return [{ device: hex4(m[1]), token: m[2] }]
  })

const reglas = (fuente: string, token: string, tabla: ReadonlyArray<readonly [RegExp, FamiliaGpu]>, otro?: FamiliaGpu): FamiliaGpu => {
  const familia = tabla.find(([re]) => re.test(token))?.[1] ?? otro
  if (familia === undefined) throw new Error(`${fuente}: token desconocido «${token}»; agrega su familia en scripts/gpu-fuentes.ts`)
  return familia
}

/** crocus covers gen4 to gen8 and is closed history, so an unknown token is a parser bug. */
export const familiaCrocus = (token: string): FamiliaGpu =>
  reglas('crocus', token, [
    [/^(i965|g4x|ilk)$/, 'intel_gen5_o_anterior'],
    [/^snb_/, 'intel_gen6'],
    [/^(ivb_|byt$)/, 'intel_gen7'],
    [/^hsw_/, 'intel_gen7_5'],
    [/^chv$/, 'intel_gen8'],
  ])

/** iris starts at Broadwell; every later platform (and any new token) is gen9 or newer. */
export const familiaIris = (token: string): FamiliaGpu =>
  reglas('iris', token, [[/^(bdw_|chv$)/, 'intel_gen8']], 'intel_gen9_o_posterior')

/** Linux `amdgpu_drv.c` chips. SI is GCN 1, CIK is GCN 2; an unknown chip fails until someone classifies it. */
const chipsAmdgpu = {
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
} as const satisfies Record<string, FamiliaGpu>

const esChip = (chip: string): chip is keyof typeof chipsAmdgpu => Object.hasOwn(chipsAmdgpu, chip)

/**
 * The explicit ids of `pciidlist[]`. Accepts both entry styles the kernel has used (`{0x1002, 0x6780, ...,
 * CHIP_X}` and `{ PCI_DEVICE(0x1002, 0x6780), .driver_data = CHIP_X }`). Class wildcards (`PCI_ANY_ID`,
 * the IP-discovery parts) carry no id and are skipped: the vendor fallback covers them.
 */
export const idsAmdgpu = (texto: string): ReadonlyArray<Dispositivo> => {
  const inicio = texto.search(/^static const struct pci_device_id pciidlist\[\] = \{$/m)
  if (inicio === -1) throw new Error('amdgpu_drv.c: no encuentro «static const struct pci_device_id pciidlist[] = {»')
  const fin = texto.indexOf('\n};', inicio)
  const cuerpo = texto
    .slice(texto.indexOf('{', inicio) + 1, fin)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')
  const entradas = cuerpo.split(/\}\s*,?/).map((e) => e.replace(/^[\s,]*\{/, '').trim())
  return entradas.flatMap((e) => {
    if (e === '' || /^0,\s*0,\s*0$/.test(e)) return []
    if (/^(PCI_DEVICE\()?0x1002,\s*PCI_ANY_ID\b/.test(e)) return []
    const m = /^(?:PCI_DEVICE\()?0x1002,\s*0x([0-9a-fA-F]{4})\b[\s\S]*?\bCHIP_([A-Z0-9_]+)/.exec(e)
    if (m?.[1] === undefined || m[2] === undefined) throw new Error(`amdgpu_drv.c: entrada ilegible «${e}»`)
    const chip = m[2]
    if (!esChip(chip)) throw new Error(`amdgpu_drv.c: CHIP_${chip} desconocido; agrega su familia en scripts/gpu-fuentes.ts`)
    return [{ vendor: '1002', device: hex4(m[1]), familia: chipsAmdgpu[chip] }]
  })
}

const codenamesNvidia: ReadonlyArray<readonly [RegExp, FamiliaGpu]> = [
  [/^GF\d/, 'nvidia_fermi'],
  [/^GK\d/, 'nvidia_kepler'],
  [/^G[MPV]\d/, 'nvidia_maxwell_a_volta'],
  [/^(TU|GA|AD|GB|GH)\d/, 'nvidia_turing_o_posterior'],
  [/^(G[0-9T]\d|NV\d|C\d)/, 'nvidia_tesla_o_anterior'],
]

// pci.ids names chipset and GPU functions with the same codename ("TU116 USB 3.1 Host Controller").
const noEsGpu = /\b(Audio|Bridge|bridge|Controller|PCIe host|USB|UCSI|SMBus|Ethernet|SATA|IDE)\b/

/** NVIDIA GPUs from `pci.ids`, classified by the codename that opens each device name. */
export const idsNvidia = (texto: string): ReadonlyArray<Dispositivo> => {
  const lineas = texto.split('\n')
  const inicio = lineas.findIndex((l) => l.startsWith('10de  '))
  if (inicio === -1) throw new Error('pci.ids: no encuentro el vendor 10de')
  const salida: Array<Dispositivo> = []
  for (const [i, linea] of lineas.slice(inicio + 1).entries()) {
    if (/^([0-9a-f]{4}  |C )/.test(linea)) break
    if (linea.trim() === '' || linea.startsWith('#') || /^\t\t[0-9a-f]{4} [0-9a-f]{4}  /.test(linea)) continue
    const m = /^\t([0-9a-f]{4})  (.+)$/.exec(linea)
    if (m?.[1] === undefined || m[2] === undefined) throw new Error(`pci.ids:${inicio + i + 2}: línea ilegible «${linea}»`)
    const nombre = m[2]
    if (noEsGpu.test(nombre.replace(/\[[^\]]*\]/g, ''))) continue
    const familia = codenamesNvidia.find(([re]) => re.test(nombre))?.[1]
    if (familia !== undefined) salida.push({ vendor: '10de', device: m[1], familia })
  }
  return salida
}

/** Fails when a source yields fewer ids than its floor: a format change that silently matches nothing. */
export const conPiso = <A>(fuente: string, piso: number, ids: ReadonlyArray<A>): ReadonlyArray<A> => {
  if (ids.length < piso) throw new Error(`${fuente}: ${ids.length} ids, menos que el piso ${piso}; ¿cambió el formato?`)
  return ids
}

export type Tabla = Record<Vendor, Partial<Record<FamiliaGpu, string>>>

/** Groups ids per vendor and family as sorted hex runs (`'0402-0406 040a'`); one id in two families fails. */
export const tablaDe = (dispositivos: ReadonlyArray<Dispositivo>): Tabla => {
  const unicos = new Map<string, Dispositivo>()
  for (const d of dispositivos) {
    const clave = `${d.vendor}:${d.device}`
    const previa = unicos.get(clave)?.familia
    if (previa !== undefined && previa !== d.familia) throw new Error(`${clave} aparece como ${previa} y como ${d.familia}`)
    unicos.set(clave, d)
  }
  const grupos = new Map<string, { readonly vendor: Vendor; readonly familia: FamiliaGpu; readonly numeros: Array<number> }>()
  for (const d of unicos.values()) {
    const clave = `${d.vendor} ${d.familia}`
    const grupo = grupos.get(clave) ?? { vendor: d.vendor, familia: d.familia, numeros: [] }
    grupo.numeros.push(parseInt(d.device, 16))
    grupos.set(clave, grupo)
  }
  const tabla: Tabla = { '8086': {}, '1002': {}, '10de': {} }
  for (const g of grupos.values()) tabla[g.vendor][g.familia] = tramos(g.numeros)
  return tabla
}

const tramos = (numeros: ReadonlyArray<number>): string => {
  const orden = [...numeros].sort((a, b) => a - b)
  const salida: Array<string> = []
  let desde = orden[0] ?? 0
  let hasta = desde
  for (const n of [...orden.slice(1), Number.POSITIVE_INFINITY]) {
    if (n === hasta + 1) {
      hasta = n
      continue
    }
    salida.push(desde === hasta ? hex4(desde.toString(16)) : `${hex4(desde.toString(16))}-${hex4(hasta.toString(16))}`)
    desde = n
    hasta = n
  }
  return salida.join(' ')
}
