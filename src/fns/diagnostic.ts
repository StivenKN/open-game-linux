import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { Schema } from 'effect'
import { DiagnosticInput, SaveDiagnostic } from '../domain/contributions.ts'
import { InvalidPayload, RuleViolated } from '../domain/errors.ts'
import { DiagnosticId } from '../domain/ids.ts'
import { registrarDiagnostico } from '../server/commands/diagnostic.ts'
import { evaluarSinGuardar, miDiagnostico, misEquipos } from '../server/queries/diagnostic.ts'
import { accion, leer } from '../server/run.ts'
import { origenPublico } from '../server/origin.ts'

export const evaluarDiagnosticoFn = createServerFn({ method: 'POST' })
  .validator(Schema.toStandardSchemaV1(DiagnosticInput))
  .handler(({ data }) => accion(InvalidPayload, evaluarSinGuardar(data)))

export const guardarDiagnosticoFn = createServerFn({ method: 'POST' })
  .validator(Schema.toStandardSchemaV1(SaveDiagnostic))
  .handler(({ data }) => accion(Schema.Union([RuleViolated, InvalidPayload]), registrarDiagnostico(data)))

export const misEquiposFn = createServerFn({ method: 'GET' }).handler(() => leer(misEquipos()))

export const miDiagnosticoFn = createServerFn({ method: 'GET' })
  .validator(Schema.toStandardSchemaV1(Schema.Struct({ id: DiagnosticId })))
  .handler(({ data }) => leer(miDiagnostico(data.id)))

export const origenFn = createServerFn({ method: 'GET' }).handler(() => origenPublico(getRequest()))
