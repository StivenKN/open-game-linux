import { createServerFn } from '@tanstack/react-start'
import { Schema } from 'effect'
import { AccessChange } from '../domain/accounts.ts'
import { RuleViolated } from '../domain/errors.ts'
import { administerAccess } from '../server/commands/accounts.ts'
import { accounts } from '../server/queries/accounts.ts'
import { runAction, runRead } from '../server/run.ts'

export const accountsFn = createServerFn({ method: 'GET' })
  .validator(Schema.toStandardSchemaV1(Schema.Struct({ q: Schema.String })))
  .handler(({ data }) => runRead(accounts(data.q)))

export const changeAccessFn = createServerFn({ method: 'POST' })
  .validator(Schema.toStandardSchemaV1(AccessChange))
  .handler(({ data }) => runAction(RuleViolated, administerAccess(data)))
