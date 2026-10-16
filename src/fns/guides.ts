import { createServerFn } from '@tanstack/react-start'
import { Schema } from 'effect'
import { GuideId } from '../domain/ids.ts'
import { guia, guias } from '../server/queries/guides.ts'
import { leer } from '../server/run.ts'

export const guiasFn = createServerFn({ method: 'GET' }).handler(() => leer(guias))

export const guiaFn = createServerFn({ method: 'GET' })
  .validator(Schema.toStandardSchemaV1(Schema.Struct({ guiaId: GuideId })))
  .handler(({ data }) => leer(guia(data.guiaId)))
