import { Schema } from 'effect'
import { RequiredText } from './ids.ts'
import { maxLengths } from './max-lengths.ts'

export const STEAM_LAUNCHER = 'Steam'

export const MAX_LIBRARY_GAMES = 1000

export const SteamAppId = Schema.Int.pipe(Schema.check(Schema.isGreaterThan(0)), Schema.brand('AppIdSteam'))
export type SteamAppId = typeof SteamAppId.Type

export const LibraryGame = Schema.Struct({ app_id: SteamAppId, nombre: RequiredText.pipe(Schema.check(Schema.isMaxLength(maxLengths.biblioteca.name))) })
export type LibraryGame = typeof LibraryGame.Type

export const SteamLibrary = Schema.Array(LibraryGame).pipe(Schema.check(Schema.isMaxLength(MAX_LIBRARY_GAMES)))
export type SteamLibrary = typeof SteamLibrary.Type

export type EvaluatedLibrary = { readonly total: number; readonly unknown: ReadonlyArray<LibraryGame> }

export const isSteamTool = (name: string): boolean =>
  /^(Proton\b|Steam Linux Runtime|Steamworks Common Redistributables)/i.test(name)
