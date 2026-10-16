import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { Schema } from 'effect'
import { EntradaDiagnostico, GuardarDiagnostico } from '../domain/contributions.ts'
import { PayloadInvalido, ReglaIncumplida } from '../domain/errors.ts'
import { DiagnosticoId } from '../domain/ids.ts'
import { registrarDiagnostico } from '../server/commands/diagnostic.ts'
import { evaluarSinGuardar, miDiagnostico, misEquipos } from '../server/queries/diagnostic.ts'
import { accion, leer } from '../server/run.ts'
import { origenPublico } from '../server/origin.ts'

export const evaluarDiagnosticoFn = createServerFn({ method: 'POST' })
  .validator(Schema.toStandardSchemaV1(EntradaDiagnostico))
  .handler(({ data }) => accion(PayloadInvalido, evaluarSinGuardar(data)))

export const guardarDiagnosticoFn = createServerFn({ method: 'POST' })
  .validator(Schema.toStandardSchemaV1(GuardarDiagnostico))
  .handler(({ data }) => accion(Schema.Union([ReglaIncumplida, PayloadInvalido]), registrarDiagnostico(data)))

export const misEquiposFn = createServerFn({ method: 'GET' }).handler(() => leer(misEquipos()))

export const miDiagnosticoFn = createServerFn({ method: 'GET' })
  .validator(Schema.toStandardSchemaV1(Schema.Struct({ id: DiagnosticoId })))
  .handler(({ data }) => leer(miDiagnostico(data.id)))

export const origenFn = createServerFn({ method: 'GET' }).handler(() => origenPublico(getRequest()))
