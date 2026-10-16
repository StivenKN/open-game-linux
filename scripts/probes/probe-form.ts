// Probe (a): can the report form post its FormData straight into NewReport?
// Run: node scripts/probes/probe-form.ts
// U2 folded the probe's fix into NewReport (failures defaults to [], the 8.7 rule lands on `failures`),
// so the sketch-schema case is gone and the "defaults to []" cases run against NewReport itself.
import { Schema } from 'effect'
import { NewReport } from '../../src/domain/contributions.ts'

type Par = readonly [string, string]

const base: ReadonlyArray<Par> = [
  ['edition_id', '1'],
  ['diagnostic_id', '2'],
  ['game_version', '  1.0.3  '],
  ['launcher_version', ''],
  ['tested_at', '2026-10-01'],
  ['outcome', 'no_inicia'],
  ['failures[0][failure_type_id]', '4'],
  ['failures[0][detail]', 'Pantalla negra al lanzar'],
  ['failures[1][failure_type_id]', '5'],
  ['failures[1][detail]', 'Se cierra el lanzador'],
  ['observations', 'Probado dos veces'],
  ['layer_version[_tag]', 'existente'],
  ['layer_version[id]', '3'],
]
const sinFallos = base.filter(([k]) => !k.startsWith('failures'))
const con = (pares: ReadonlyArray<Par>, cambios: Record<string, string>): ReadonlyArray<Par> => [
  ...pares.filter(([k]) => !(k in cambios)),
  ...Object.entries(cambios),
]

const casos: ReadonlyArray<readonly [string, Schema.Codec<unknown, unknown>, ReadonlyArray<Par>]> = [
  ['profile_id "" and measurement ""', NewReport, con(base, { profile_id: '', measurement: '' })],
  ['profile_id and measurement missing', NewReport, base],
  ['profile_id "null" and measurement "null" (the StringTree canonical null)', NewReport, con(base, { profile_id: 'null', measurement: 'null' })],
  [
    'new layer_version, profile 7, full measurement',
    NewReport,
    con(base.filter(([k]) => !k.startsWith('layer_version')), {
      'layer_version[_tag]': 'nueva',
      'layer_version[family]': 'Proton',
      'layer_version[variant]': 'GE',
      'layer_version[version]': '9-20',
      profile_id: '7',
      'measurement[avg_fps]': '61.5',
      'measurement[resolution]': '1920x1080',
      'measurement[graphics_quality]': 'alta',
      'measurement[measurement_method]': 'MangoHud',
    }),
  ],
  ['funciona without failures, failures defaults to []', NewReport, con(sinFallos, { outcome: 'funciona', profile_id: 'null', measurement: 'null' })],
  ['no_inicia without failures, failures defaults to [] (rule 8.7)', NewReport, con(sinFallos, { profile_id: 'null', measurement: 'null' })],
  ['non-numeric id', NewReport, con(base, { 'layer_version[id]': 'abc', profile_id: 'null', measurement: 'null' })],
  ['optional text written as "null"', NewReport, con(base, { launcher_version: 'null', profile_id: 'null', measurement: 'null' })],
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
