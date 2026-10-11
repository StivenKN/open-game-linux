import { createServerFn } from '@tanstack/react-start'
import { Schema } from 'effect'
import { GuiaId } from '../dominio/ids.ts'
import { guia, guias } from '../servidor/consultas/guias.ts'
import { leer } from '../servidor/ejecutar.ts'

export const guiasFn = createServerFn({ method: 'GET' }).handler(() => leer(guias))

export const guiaFn = createServerFn({ method: 'GET' })
  .validator(Schema.toStandardSchemaV1(Schema.Struct({ guiaId: GuiaId })))
  .handler(({ data }) => leer(guia(data.guiaId)))
