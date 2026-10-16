import { describe, expect, it } from '@effect/vitest'
import { chipsetsMesa, conPiso, familiaCrocus, familiaIris, idsAmdgpu, idsNvidia, tablaDe } from './gpu-sources.ts'

describe('chipsetsMesa', () => {
  it('reads every CHIPSET line and skips blank ones', () => {
    const texto = `CHIPSET(0x0412, hsw_gt2, "HSW GT2", "Intel(R) HD Graphics 4600")

CHIPSET(0xa011, PNV_GM,   "Intel(R) Pineview M")
CHIPSET(0x9400, R600_9400, R600)`
    expect(chipsetsMesa(texto, 'x')).toEqual([
      { device: '0412', token: 'hsw_gt2' },
      { device: 'a011', token: 'PNV_GM' },
      { device: '9400', token: 'R600_9400' },
    ])
  })
  it('fails on a line it cannot read', () => {
    expect(() => chipsetsMesa('CHIPSET(0x0412, hsw_gt2, "x")\n#define OTRA 1', 'crocus')).toThrow('crocus:2: línea ilegible «#define OTRA 1»')
  })
})

describe('Intel tokens', () => {
  it.each([
    ['i965', 'intel_gen5_o_anterior'],
    ['ilk', 'intel_gen5_o_anterior'],
    ['snb_gt2', 'intel_gen6'],
    ['ivb_gt2', 'intel_gen7'],
    ['byt', 'intel_gen7'],
    ['hsw_gt3', 'intel_gen7_5'],
    ['chv', 'intel_gen8'],
  ])('crocus %s -> %s', (token, familia) => {
    expect(familiaCrocus(token)).toBe(familia)
  })
  it('crocus fails on a token it has no rule for', () => {
    expect(() => familiaCrocus('xyz_gt1')).toThrow('crocus: token desconocido «xyz_gt1»')
  })
  it.each([
    ['bdw_gt2', 'intel_gen8'],
    ['skl_gt2', 'intel_gen9_o_posterior'],
    ['nvl_p', 'intel_gen9_o_posterior'],
  ])('iris %s -> %s', (token, familia) => {
    expect(familiaIris(token)).toBe(familia)
  })
})

describe('idsAmdgpu', () => {
  const lista = (cuerpo: string) => `static const u16 amdgpu_unsupported_pciidlist[] = {
\t0x4354,
};
static const struct pci_device_id pciidlist[] = {
${cuerpo}
\t{0, 0, 0}
};`

  it('reads both entry styles, keeps flags out of the chip and skips class wildcards', () => {
    const texto = lista(`\t/* Kaveri */
\t{0x1002, 0x6798, PCI_ANY_ID, PCI_ANY_ID, 0, 0, CHIP_TAHITI},
\t{0x1002, 0x665C, PCI_ANY_ID, PCI_ANY_ID, 0, 0, CHIP_BONAIRE|AMD_IS_MOBILITY},
\t{ PCI_DEVICE(0x1002, 0x67DF), .driver_data = CHIP_POLARIS10 },
\t{ PCI_DEVICE(0x1002, PCI_ANY_ID),
\t  .class = PCI_CLASS_DISPLAY_VGA << 8,
\t  .class_mask = 0xffffff,
\t  .driver_data = CHIP_IP_DISCOVERY },`)
    expect(idsAmdgpu(texto)).toEqual([
      { vendor: '1002', device: '6798', familia: 'amd_gcn1' },
      { vendor: '1002', device: '665c', familia: 'amd_gcn2' },
      { vendor: '1002', device: '67df', familia: 'amd_gcn3_o_posterior' },
    ])
  })
  it('fails on an unknown CHIP_*', () => {
    expect(() => idsAmdgpu(lista('\t{0x1002, 0x7550, PCI_ANY_ID, PCI_ANY_ID, 0, 0, CHIP_NAVI48},'))).toThrow('CHIP_NAVI48 desconocido')
  })
  it('fails on an entry it cannot read', () => {
    expect(() => idsAmdgpu(lista('\t{0x1002, CHIP_TAHITI},'))).toThrow('entrada ilegible')
  })
})

describe('idsNvidia', () => {
  const texto = `# comment
10de  NVIDIA Corporation
\t0de1  GF108 [GeForce GT 430]
\t\t1043 8366  GeForce GT 430
\t0e0f  GK208 HDMI/DP Audio Controller
\t128b  GK208B [GeForce GT 710]
\t1380  GM107 [GeForce GTX 750 Ti]
\t1aeb  TU116 USB 3.1 Host Controller
\t1f82  TU117 [GeForce GTX 1650]
\t0243  C51 PCI Express Bridge
\t0040  NV40 [GeForce 6800 Ultra]
\t0fbb  GK104 High Definition Audio Controller [GeForce GTX 670]
\t1d81  GV100 [TITAN V]
\t0008  NV1 [EDGE 3D]
\t2c2c  GB6-256(N22W-ES-A1)
\t0a20  Unknown chip
10df  Emulex Corporation
\t1ae5  LP6000 Fibre Channel Host Adapter`

  it('keeps GPU lines by codename and drops audio, USB, bridges and other vendors', () => {
    expect(idsNvidia(texto).map((d) => `${d.device} ${d.familia}`)).toEqual([
      '0de1 nvidia_fermi',
      '128b nvidia_kepler',
      '1380 nvidia_maxwell_a_volta',
      '1f82 nvidia_turing_o_posterior',
      '0040 nvidia_tesla_o_anterior',
      '1d81 nvidia_maxwell_a_volta',
      '0008 nvidia_tesla_o_anterior',
      '2c2c nvidia_turing_o_posterior',
    ])
  })
  it('fails on a line it cannot read inside the vendor block', () => {
    expect(() => idsNvidia('10de  NVIDIA Corporation\n\t0de1 GF108')).toThrow('pci.ids:2: línea ilegible')
  })
})

describe('conPiso', () => {
  it('fails below the floor and passes at it', () => {
    expect(() => conPiso('iris', 3, [1, 2])).toThrow('iris: 2 ids, menos que el piso 3')
    expect(conPiso('iris', 2, [1, 2])).toEqual([1, 2])
  })
})

describe('tablaDe', () => {
  it('groups ids per vendor and family as sorted hex runs', () => {
    expect(
      tablaDe([
        { vendor: '10de', device: '0406', familia: 'nvidia_tesla_o_anterior' },
        { vendor: '10de', device: '0402', familia: 'nvidia_tesla_o_anterior' },
        { vendor: '10de', device: '0403', familia: 'nvidia_tesla_o_anterior' },
        { vendor: '10de', device: '0404', familia: 'nvidia_tesla_o_anterior' },
        { vendor: '10de', device: '0405', familia: 'nvidia_tesla_o_anterior' },
        { vendor: '10de', device: '040a', familia: 'nvidia_tesla_o_anterior' },
        { vendor: '10de', device: '040a', familia: 'nvidia_tesla_o_anterior' },
        { vendor: '8086', device: '0412', familia: 'intel_gen7_5' },
      ]),
    ).toEqual({ '8086': { intel_gen7_5: '0412' }, '1002': {}, '10de': { nvidia_tesla_o_anterior: '0402-0406 040a' } })
  })
  it('fails when one id lands in two families', () => {
    expect(() =>
      tablaDe([
        { vendor: '1002', device: '6798', familia: 'amd_gcn1' },
        { vendor: '1002', device: '6798', familia: 'amd_terascale_o_anterior' },
      ]),
    ).toThrow('1002:6798 aparece como amd_gcn1 y como amd_terascale_o_anterior')
  })
})
