// Regenerates src/servidor/gpu/familias.generado.ts from pinned upstream sources: `pnpm gpu:generar`.
// To pick up new GPUs, bump the pins below, run it, and review the printed counts and the diff.
import { writeFileSync } from 'node:fs'
import { FamiliaGpu } from '../src/dominio/gpu.ts'
import { chipsetsMesa, conPiso, type Dispositivo, familiaCrocus, familiaIris, idsAmdgpu, idsNvidia, tablaDe } from './gpu-fuentes.ts'

const fuentes = {
  mesa: '2d0ec19dc8874e98860c1b1e506e18b1942e623f',
  linux: 'v7.2',
  pciids: '6b9987960d8d7e8cb87d2fcea0984e82b7e505f8',
} as const

const destino = new URL('../src/servidor/gpu/familias.generado.ts', import.meta.url)

const bajar = async (url: string) => {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`)
  return r.text()
}
const mesa = (archivo: string) =>
  bajar(`https://gitlab.freedesktop.org/mesa/mesa/-/raw/${fuentes.mesa}/include/pci_ids/${archivo}_pci_ids.h`).then((t) => chipsetsMesa(t, archivo))

const [crocus, iris, i915, i830, r300, r600, amdgpu, pciids] = await Promise.all([
  mesa('crocus'),
  mesa('iris'),
  mesa('i915'),
  mesa('i830'),
  mesa('r300'),
  mesa('r600'),
  bajar(`https://raw.githubusercontent.com/torvalds/linux/${fuentes.linux}/drivers/gpu/drm/amd/amdgpu/amdgpu_drv.c`),
  bajar(`https://raw.githubusercontent.com/pciutils/pciids/${fuentes.pciids}/pci.ids`),
])

// Floors sit a little under the counts at the pinned sources.
const dispositivos: ReadonlyArray<Dispositivo> = [
  ...conPiso('crocus', 90, crocus).map((c) => ({ vendor: '8086', device: c.device, familia: familiaCrocus(c.token) }) as const),
  ...conPiso('iris', 280, iris).map((c) => ({ vendor: '8086', device: c.device, familia: familiaIris(c.token) }) as const),
  ...conPiso('i915+i830', 14, [...i915, ...i830]).map((c) => ({ vendor: '8086', device: c.device, familia: 'intel_gen5_o_anterior' }) as const),
  ...conPiso('r300+r600', 500, [...r300, ...r600]).map((c) => ({ vendor: '1002', device: c.device, familia: 'amd_terascale_o_anterior' }) as const),
  ...conPiso('amdgpu_drv.c', 280, idsAmdgpu(amdgpu)),
  ...conPiso('pci.ids 10de', 1400, idsNvidia(pciids)),
]
const tabla = tablaDe(dispositivos)

const vendores = ['8086', '1002', '10de'] as const
const bloque = vendores
  .map((v) => {
    const familias = FamiliaGpu.literals.flatMap((f) => {
      const ids = tabla[v][f]
      return ids === undefined ? [] : [`      ${f}: '${ids}',`]
    })
    return `    '${v}': {\n${familias.join('\n')}\n    },`
  })
  .join('\n')

writeFileSync(
  destino,
  `// GENERADO por scripts/generar-gpus.ts (pnpm gpu:generar). No lo edites a mano.
// Mesa ${fuentes.mesa}: include/pci_ids/{crocus,iris,i915,i830,r300,r600}_pci_ids.h
// Linux ${fuentes.linux}: drivers/gpu/drm/amd/amdgpu/amdgpu_drv.c
// pciutils/pciids ${fuentes.pciids}: pci.ids
import type { FamiliaGpu } from '../../dominio/gpu.ts'

/** \`marca\` lets scripts/sin-servidor-en-cliente.ts spot this table in a browser bundle. */
export const tablaGpu = {
  marca: 'OPENGAME_TABLA_GPU',
  fuentes: { mesa: '${fuentes.mesa}', linux: '${fuentes.linux}', pciids: '${fuentes.pciids}' },
  ids: {
${bloque}
  } satisfies Record<'8086' | '1002' | '10de', Partial<Record<FamiliaGpu, string>>>,
} as const
`,
)

const unicos = new Map(dispositivos.map((d) => [`${d.vendor}:${d.device}`, d.familia]))
for (const f of FamiliaGpu.literals) console.log(`${f.padEnd(28)}${[...unicos.values()].filter((u) => u === f).length}`)
console.log(`Escrito ${destino.pathname}`)
