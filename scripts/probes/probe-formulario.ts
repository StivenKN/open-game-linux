// Probe (a): can the report form post its FormData straight into NuevoReporte?
// Run: node scripts/probes/probe-formulario.ts
// U2 folded the probe's fix into NuevoReporte (fallos defaults to [], the 8.7 rule lands on `fallos`),
// so the sketch-schema case is gone and the "con defecto" cases run against NuevoReporte itself.
import { Schema } from 'effect'
import { NewReport } from '../../src/domain/contributions.ts'

type Par = readonly [string, string]

const base: ReadonlyArray<Par> = [
  ['edicion_id', '1'],
  ['diagnostico_id', '2'],
  ['version_juego', '  1.0.3  '],
  ['version_lanzador', ''],
  ['fecha_prueba', '2026-10-01'],
  ['resultado', 'no_inicia'],
  ['fallos[0][tipo_fallo_id]', '4'],
  ['fallos[0][detalle]', 'Pantalla negra al lanzar'],
  ['fallos[1][tipo_fallo_id]', '5'],
  ['fallos[1][detalle]', 'Se cierra el lanzador'],
  ['observaciones', 'Probado dos veces'],
  ['version_capa[_tag]', 'existente'],
  ['version_capa[id]', '3'],
]
const sinFallos = base.filter(([k]) => !k.startsWith('fallos'))
const con = (pares: ReadonlyArray<Par>, cambios: Record<string, string>): ReadonlyArray<Par> => [
  ...pares.filter(([k]) => !(k in cambios)),
  ...Object.entries(cambios),
]

const casos: ReadonlyArray<readonly [string, Schema.Codec<unknown, unknown>, ReadonlyArray<Par>]> = [
  ['perfil_id "" y medicion ""', NewReport, con(base, { perfil_id: '', medicion: '' })],
  ['perfil_id y medicion ausentes', NewReport, base],
  ['perfil_id "null" y medicion "null" (nulo canónico de StringTree)', NewReport, con(base, { perfil_id: 'null', medicion: 'null' })],
  [
    'version_capa nueva, perfil 7, medición completa',
    NewReport,
    con(base.filter(([k]) => !k.startsWith('version_capa')), {
      'version_capa[_tag]': 'nueva',
      'version_capa[familia]': 'Proton',
      'version_capa[variante]': 'GE',
      'version_capa[version]': '9-20',
      perfil_id: '7',
      'medicion[fps_promedio]': '61.5',
      'medicion[resolucion]': '1920x1080',
      'medicion[calidad_grafica]': 'alta',
      'medicion[metodo_medicion]': 'MangoHud',
    }),
  ],
  ['funciona sin fallos, fallos con defecto []', NewReport, con(sinFallos, { resultado: 'funciona', perfil_id: 'null', medicion: 'null' })],
  ['no_inicia sin fallos, fallos con defecto [] (regla 8.7)', NewReport, con(sinFallos, { perfil_id: 'null', medicion: 'null' })],
  ['id no numérico', NewReport, con(base, { 'version_capa[id]': 'abc', perfil_id: 'null', medicion: 'null' })],
  ['texto opcional escrito "null"', NewReport, con(base, { version_lanzador: 'null', perfil_id: 'null', medicion: 'null' })],
]

for (const [nombre, esquema, pares] of casos) {
  const datos = new FormData()
  for (const [k, v] of pares) datos.append(k, v)
  const validar = Schema.toStandardSchemaV1(Schema.fromFormData(Schema.toCodecStringTree(esquema)))['~standard'].validate
  const resultado = await validar(datos)
  console.log(`\n## ${nombre}`)
  if (resultado.issues === undefined) console.log(resultado.value)
  else for (const i of resultado.issues) console.log(`issue at ${JSON.stringify(i.path ?? [])}: ${i.message}`)
}
