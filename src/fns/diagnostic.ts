import { createServerFn } from '@tanstack/react-start'
import { Schema } from 'effect'
import { DiagnosticInput, SaveDiagnostic } from '../domain/contributions.ts'
import { InvalidPayload, RuleViolated } from '../domain/errors.ts'
import { DiagnosticId } from '../domain/ids.ts'
import { submitDiagnostic } from '../server/commands/diagnostic.ts'
import { evaluateWithoutSaving, myDiagnostic, myMachines } from '../server/queries/diagnostic.ts'
import { runAction, runRead } from '../server/run.ts'

export const evaluateDiagnosticFn = createServerFn({ method: 'POST' })
  .validator(Schema.toStandardSchemaV1(DiagnosticInput))
  .handler(({ data }) => runAction(InvalidPayload, evaluateWithoutSaving(data)))

export const saveDiagnosticFn = createServerFn({ method: 'POST' })
  .validator(Schema.toStandardSchemaV1(SaveDiagnostic))
  .handler(({ data }) => runAction(Schema.Union([RuleViolated, InvalidPayload]), submitDiagnostic(data)))

export const myMachinesFn = createServerFn({ method: 'GET' }).handler(() => runRead(myMachines()))

export const myDiagnosticFn = createServerFn({ method: 'GET' })
  .validator(Schema.toStandardSchemaV1(Schema.Struct({ id: DiagnosticId })))
  .handler(({ data }) => runRead(myDiagnostic(data.id)))
