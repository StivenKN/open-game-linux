import { createServerFn } from '@tanstack/react-start'
import { Schema } from 'effect'
import { NewSolution, NewGame, NewReport } from '../domain/contributions.ts'
import { IncomparableProfile, RuleViolated } from '../domain/errors.ts'
import { GameId, ProfileId, ReportId } from '../domain/ids.ts'
import { createGame, submitReport, submitSolution } from '../server/commands/contributions.ts'
import { myContributions } from '../server/queries/contributions.ts'
import { gameOptions, reportOptions, solutionOptions } from '../server/queries/form-options.ts'
import { runAction, runRead } from '../server/run.ts'

export const reportOptionsFn = createServerFn({ method: 'GET' })
  .validator(Schema.toStandardSchemaV1(Schema.Struct({ gameId: GameId, perfil: Schema.NullOr(ProfileId) })))
  .handler(({ data }) => runRead(reportOptions(data.gameId, data.perfil)))

export const submitReportFn = createServerFn({ method: 'POST' })
  .validator(Schema.toStandardSchemaV1(NewReport))
  .handler(({ data }) => runAction(Schema.Union([RuleViolated, IncomparableProfile]), submitReport(data)))

export const solutionOptionsFn = createServerFn({ method: 'GET' })
  .validator(Schema.toStandardSchemaV1(Schema.Struct({ reportId: ReportId })))
  .handler(({ data }) => runRead(solutionOptions(data.reportId)))

export const submitSolutionFn = createServerFn({ method: 'POST' })
  .validator(Schema.toStandardSchemaV1(NewSolution))
  .handler(({ data }) => runAction(RuleViolated, submitSolution(data)))

export const gameOptionsFn = createServerFn({ method: 'GET' }).handler(() => runRead(gameOptions))

export const createGameFn = createServerFn({ method: 'POST' })
  .validator(Schema.toStandardSchemaV1(NewGame))
  .handler(({ data }) => runAction(RuleViolated, createGame(data)))

export const myContributionsFn = createServerFn({ method: 'GET' }).handler(() => runRead(myContributions))
