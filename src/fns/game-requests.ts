import { createServerFn } from '@tanstack/react-start'
import { Schema } from 'effect'
import { RejectRequest, RequestGame } from '../domain/contributions.ts'
import { RuleViolated } from '../domain/errors.ts'
import { GameRequestId } from '../domain/ids.ts'
import { rejectRequest, requestGame, withdrawRequest } from '../server/commands/game-requests.ts'
import { gameRequests } from '../server/queries/game-requests.ts'
import { runAction, runRead } from '../server/run.ts'

export const gameRequestsFn = createServerFn({ method: 'GET' }).handler(() => runRead(gameRequests))

export const requestGameFn = createServerFn({ method: 'POST' })
  .validator(Schema.toStandardSchemaV1(RequestGame))
  .handler(({ data }) => runAction(RuleViolated, requestGame(data)))

export const withdrawRequestFn = createServerFn({ method: 'POST' })
  .validator(Schema.toStandardSchemaV1(Schema.Struct({ id: GameRequestId })))
  .handler(({ data }) => runAction(RuleViolated, withdrawRequest(data.id)))

export const rejectRequestFn = createServerFn({ method: 'POST' })
  .validator(Schema.toStandardSchemaV1(RejectRequest))
  .handler(({ data }) => runAction(RuleViolated, rejectRequest(data)))
