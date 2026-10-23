import { Schema, SchemaTransformation } from 'effect'
import { RequiredText } from './ids.ts'
import { maxLengths } from './max-lengths.ts'

export const STEAM_LAUNCHER = 'Steam'

export const MAX_LIBRARY_GAMES = 1000

export const SteamAppId = Schema.Int.pipe(Schema.check(Schema.isGreaterThan(0)), Schema.brand('SteamAppId'))
export type SteamAppId = typeof SteamAppId.Type

// Nine digits at most, so the App ID fits an integer column.
const storeRef = /^(?:(?:https?:\/\/)?store\.steampowered\.com\/app\/)?([1-9][0-9]{0,8})(?:[/?#].*)?$/

/** What a person pastes to name a Steam game: its store link or its App ID. Decodes to the App ID. */
export const SteamStoreRef = Schema.Trim.check(
  Schema.isPattern(storeRef, { message: 'Pega el enlace de la tienda de Steam (store.steampowered.com/app/…) o su App ID.' }),
).pipe(Schema.decodeTo(SteamAppId, SchemaTransformation.transform({ decode: (ref: string) => Number(storeRef.exec(ref)?.[1]), encode: String })))

export const LibraryGame = Schema.Struct({ app_id: SteamAppId, nombre: RequiredText.pipe(Schema.check(Schema.isMaxLength(maxLengths.library.name))) })
export type LibraryGame = typeof LibraryGame.Type

export const SteamLibrary = Schema.Array(LibraryGame).pipe(Schema.check(Schema.isMaxLength(MAX_LIBRARY_GAMES)))
export type SteamLibrary = typeof SteamLibrary.Type

export type EvaluatedLibrary = { readonly total: number; readonly unknown: ReadonlyArray<LibraryGame> }

export const isSteamTool = (name: string): boolean =>
  /^(Proton\b|Steam Linux Runtime|Steamworks Common Redistributables)/i.test(name)
