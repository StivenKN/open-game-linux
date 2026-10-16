import { createServerFn } from '@tanstack/react-start'
import { Schema } from 'effect'
import { CatalogFilter } from '../domain/contributions.ts'
import { GameId, ProfileId } from '../domain/ids.ts'
import { catalog } from '../server/queries/catalog.ts'
import { gamePage } from '../server/queries/game.ts'
import { profile } from '../server/queries/profile.ts'
import { runRead } from '../server/run.ts'

export const catalogFn = createServerFn({ method: 'GET' })
  .validator(Schema.toStandardSchemaV1(CatalogFilter))
  .handler(({ data }) => runRead(catalog(data)))

export const gamePageFn = createServerFn({ method: 'GET' })
  .validator(Schema.toStandardSchemaV1(Schema.Struct({ gameId: GameId })))
  .handler(({ data }) => runRead(gamePage(data.gameId)))

export const profileFn = createServerFn({ method: 'GET' })
  .validator(Schema.toStandardSchemaV1(Schema.Struct({ profileId: ProfileId })))
  .handler(({ data }) => runRead(profile(data.profileId)))
