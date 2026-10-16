import { createServerFn } from '@tanstack/react-start'
import { Schema } from 'effect'
import { ReglaIncumplida } from '../domain/errors.ts'
import { ReporteId } from '../domain/ids.ts'
import { NotaArreglo } from '../domain/upstream.ts'
import { anotarArreglo } from '../server/commands/upstream.ts'
import { informeProtonDe } from '../server/queries/upstream.ts'
import { accion, leer } from '../server/run.ts'

export const anotarArregloFn = createServerFn({ method: 'POST' })
  .validator(Schema.toStandardSchemaV1(NotaArreglo))
  .handler(({ data }) => accion(ReglaIncumplida, anotarArreglo(data)))

export const informeProtonFn = createServerFn({ method: 'GET' })
  .validator(Schema.toStandardSchemaV1(Schema.Struct({ reporteId: ReporteId })))
  .handler(({ data }) => leer(informeProtonDe(data.reporteId)))
