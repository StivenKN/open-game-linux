import { createServerFn } from '@tanstack/react-start'
import { Schema } from 'effect'
import { ReglaIncumplida } from '../dominio/fallos.ts'
import { NotaArreglo } from '../dominio/upstream.ts'
import { anotarArreglo } from '../servidor/aportes/upstream.ts'
import { accion } from '../servidor/ejecutar.ts'

export const anotarArregloFn = createServerFn({ method: 'POST' })
  .validator(Schema.toStandardSchemaV1(NotaArreglo))
  .handler(({ data }) => accion(ReglaIncumplida, anotarArreglo(data)))
