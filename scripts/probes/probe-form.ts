// Probe (a): can the report form post its FormData straight into NewReport?
// Run: node scripts/probes/probe-form.ts
import { Schema } from 'effect'
import { NewReport } from '../../src/domain/contributions.ts'

type Pair = readonly [string, string]

const base: ReadonlyArray<Pair> = [
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
const withoutFailures = base.filter(([k]) => !k.startsWith('failures'))
const withChanges = (pairs: ReadonlyArray<Pair>, changes: Record<string, string>): ReadonlyArray<Pair> => [
  ...pairs.filter(([k]) => !(k in changes)),
  ...Object.entries(changes),
]

const cases: ReadonlyArray<readonly [string, Schema.Codec<unknown, unknown>, ReadonlyArray<Pair>]> = [
  ['profile_id "" and measurement ""', NewReport, withChanges(base, { profile_id: '', measurement: '' })],
  ['profile_id and measurement missing', NewReport, base],
  ['profile_id "null" and measurement "null" (the StringTree canonical null)', NewReport, withChanges(base, { profile_id: 'null', measurement: 'null' })],
  [
    'new layer_version, profile 7, full measurement',
    NewReport,
    withChanges(base.filter(([k]) => !k.startsWith('layer_version')), {
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
  ['funciona without failures, failures defaults to []', NewReport, withChanges(withoutFailures, { outcome: 'funciona', profile_id: 'null', measurement: 'null' })],
  ['no_inicia without failures, failures defaults to [] (rule 8.7)', NewReport, withChanges(withoutFailures, { profile_id: 'null', measurement: 'null' })],
  ['non-numeric id', NewReport, withChanges(base, { 'layer_version[id]': 'abc', profile_id: 'null', measurement: 'null' })],
  ['optional text written as "null"', NewReport, withChanges(base, { launcher_version: 'null', profile_id: 'null', measurement: 'null' })],
]

for (const [name, schema, pairs] of cases) {
  const data = new FormData()
  for (const [k, v] of pairs) data.append(k, v)
  const validate = Schema.toStandardSchemaV1(Schema.fromFormData(Schema.toCodecStringTree(schema)))['~standard'].validate
  const result = await validate(data)
  console.log(`\n## ${name}`)
  if (result.issues === undefined) console.log(result.value)
  else for (const i of result.issues) console.log(`issue at ${JSON.stringify(i.path ?? [])}: ${i.message}`)
}
