import { createServerFn } from '@tanstack/react-start'
import { Schema } from 'effect'
import { AprobacionBloqueada, ReglaIncumplida, TransicionInvalida } from '../domain/errors.ts'
import { AporteRef, Decision, TipoAporte } from '../domain/review.ts'
import { decidir } from '../server/commands/review.ts'
import { cola } from '../server/queries/review.ts'
import { accion, leer } from '../server/run.ts'

export const colaFn = createServerFn({ method: 'GET' })
  .validator(Schema.toStandardSchemaV1(Schema.Struct({ tipo: TipoAporte })))
  .handler(({ data }) => leer(cola(data.tipo)))

export const decidirFn = createServerFn({ method: 'POST' })
  .validator(Schema.toStandardSchemaV1(Schema.Struct({ ref: AporteRef, decision: Decision })))
  .handler(({ data }) => accion(Schema.Union([ReglaIncumplida, TransicionInvalida, AprobacionBloqueada]), decidir(data.ref, data.decision)))
