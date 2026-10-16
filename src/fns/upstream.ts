import { createServerFn } from '@tanstack/react-start'
import { Schema } from 'effect'
import { RuleViolated } from '../domain/errors.ts'
import { ReportId } from '../domain/ids.ts'
import { FixNote } from '../domain/upstream.ts'
import { anotarArreglo } from '../server/commands/upstream.ts'
import { informeProtonDe } from '../server/queries/upstream.ts'
import { accion, leer } from '../server/run.ts'

export const anotarArregloFn = createServerFn({ method: 'POST' })
  .validator(Schema.toStandardSchemaV1(FixNote))
  .handler(({ data }) => accion(RuleViolated, anotarArreglo(data)))

export const informeProtonFn = createServerFn({ method: 'GET' })
  .validator(Schema.toStandardSchemaV1(Schema.Struct({ reporteId: ReportId })))
  .handler(({ data }) => leer(informeProtonDe(data.reporteId)))
