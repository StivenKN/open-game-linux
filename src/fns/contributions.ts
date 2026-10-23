import { createServerFn } from '@tanstack/react-start'
import { Schema } from 'effect'
import { NewSolution, NewGame, NewProfile, NewReport, ProfileEdit, SteamLookup } from '../domain/contributions.ts'
import { IncomparableProfile, RuleViolated, SteamUnavailable } from '../domain/errors.ts'
import { GameId, GameRequestId, ProfileId, ReportId } from '../domain/ids.ts'
import { createGame, deleteProfile, editProfile, proposeProfile, submitReport, submitSolution } from '../server/commands/contributions.ts'
import { myContributions } from '../server/queries/contributions.ts'
import { steamGame } from '../server/external/steam.ts'
import { gameOptions, profileEditOptions, profileOptions, reportOptions, solutionOptions } from '../server/queries/form-options.ts'
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

export const gameOptionsFn = createServerFn({ method: 'GET' })
  .validator(Schema.toStandardSchemaV1(Schema.Struct({ pedido: Schema.NullOr(GameRequestId) })))
  .handler(({ data }) => runRead(gameOptions(data.pedido)))

export const steamGameFn = createServerFn({ method: 'POST' })
  .validator(Schema.toStandardSchemaV1(SteamLookup))
  .handler(({ data }) => runAction(SteamUnavailable, steamGame(data.steam_app_id)))

export const createGameFn = createServerFn({ method: 'POST' })
  .validator(Schema.toStandardSchemaV1(NewGame))
  .handler(({ data }) => runAction(RuleViolated, createGame(data)))

export const myContributionsFn = createServerFn({ method: 'GET' }).handler(() => runRead(myContributions))

export const profileOptionsFn = createServerFn({ method: 'GET' })
  .validator(Schema.toStandardSchemaV1(Schema.Struct({ gameId: GameId, desde: Schema.NullOr(ProfileId) })))
  .handler(({ data }) => runRead(profileOptions(data.gameId, data.desde)))

export const proposeProfileFn = createServerFn({ method: 'POST' })
  .validator(Schema.toStandardSchemaV1(NewProfile))
  .handler(({ data }) => runAction(RuleViolated, proposeProfile(data)))

export const profileEditOptionsFn = createServerFn({ method: 'GET' })
  .validator(Schema.toStandardSchemaV1(Schema.Struct({ profileId: ProfileId })))
  .handler(({ data }) => runRead(profileEditOptions(data.profileId)))

export const editProfileFn = createServerFn({ method: 'POST' })
  .validator(Schema.toStandardSchemaV1(ProfileEdit))
  .handler(({ data }) => runAction(RuleViolated, editProfile(data)))

export const deleteProfileFn = createServerFn({ method: 'POST' })
  .validator(Schema.toStandardSchemaV1(Schema.Struct({ profile_id: ProfileId })))
  .handler(({ data }) => runAction(RuleViolated, deleteProfile(data.profile_id)))
