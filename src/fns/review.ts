import { createServerFn } from '@tanstack/react-start'
import { Schema } from 'effect'
import { ApprovalBlocked, RuleViolated, InvalidTransition } from '../domain/errors.ts'
import { ContributionRef, Decision, ContributionType } from '../domain/review.ts'
import { decidir } from '../server/commands/review.ts'
import { cola } from '../server/queries/review.ts'
import { accion, leer } from '../server/run.ts'

export const colaFn = createServerFn({ method: 'GET' })
  .validator(Schema.toStandardSchemaV1(Schema.Struct({ tipo: ContributionType })))
  .handler(({ data }) => leer(cola(data.tipo)))

export const decidirFn = createServerFn({ method: 'POST' })
  .validator(Schema.toStandardSchemaV1(Schema.Struct({ ref: ContributionRef, decision: Decision })))
  .handler(({ data }) => accion(Schema.Union([RuleViolated, InvalidTransition, ApprovalBlocked]), decidir(data.ref, data.decision)))
