import { createServerFn } from '@tanstack/react-start'
import { Schema } from 'effect'
import { ApprovalBlocked, RuleViolated, InvalidTransition } from '../domain/errors.ts'
import { ContributionRef, Decision, ContributionType } from '../domain/review.ts'
import { decide } from '../server/commands/review.ts'
import { queue } from '../server/queries/review.ts'
import { runAction, runRead } from '../server/run.ts'

export const queueFn = createServerFn({ method: 'GET' })
  .validator(Schema.toStandardSchemaV1(Schema.Struct({ tipo: ContributionType })))
  .handler(({ data }) => runRead(queue(data.tipo)))

export const decideFn = createServerFn({ method: 'POST' })
  .validator(Schema.toStandardSchemaV1(Schema.Struct({ ref: ContributionRef, decision: Decision })))
  .handler(({ data }) => runAction(Schema.Union([RuleViolated, InvalidTransition, ApprovalBlocked]), decide(data.ref, data.decision)))
