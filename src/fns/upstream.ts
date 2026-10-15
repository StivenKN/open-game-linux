import { createServerFn } from '@tanstack/react-start'
import { Schema } from 'effect'
import { ReglaIncumplida } from '../dominio/fallos.ts'
import { ReporteId } from '../dominio/ids.ts'
import { NotaArreglo } from '../dominio/upstream.ts'
import { anotarArreglo } from '../servidor/aportes/upstream.ts'
import { informeProtonDe } from '../servidor/consultas/upstream.ts'
import { accion, leer } from '../servidor/ejecutar.ts'

export const anotarArregloFn = createServerFn({ method: 'POST' })
  .validator(Schema.toStandardSchemaV1(NotaArreglo))
  .handler(({ data }) => accion(ReglaIncumplida, anotarArreglo(data)))

export const informeProtonFn = createServerFn({ method: 'GET' })
  .validator(Schema.toStandardSchemaV1(Schema.Struct({ reporteId: ReporteId })))
  .handler(({ data }) => leer(informeProtonDe(data.reporteId)))
