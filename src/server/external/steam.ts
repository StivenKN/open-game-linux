// The Steam store's public appdetails endpoint: no key, Spanish text where the store has it. A reviewer calls it
// from /catalogo/nuevo to fill the form; nothing it returns is stored until the reviewer creates the game.
import { Effect, Option, Result, Schema } from 'effect'
import { SteamUnavailable } from '../../domain/errors.ts'
import { SteamAppId } from '../../domain/library.ts'
import { requireReviewer } from '../auth.ts'

const TIMEOUT_MS = 5000

const AppDetails = Schema.Struct({
  success: Schema.Boolean,
  data: Schema.optionalKey(Schema.Struct({ type: Schema.String, name: Schema.String, steam_appid: SteamAppId, short_description: Schema.String })),
})
const Body = Schema.Record(Schema.String, AppDetails)

/** What the new-game form takes from the store. The App ID is Steam's own, which can differ from the one asked for. */
export type SteamGame = { readonly appid: SteamAppId; readonly title: string; readonly description: string }

const entities: Readonly<Record<string, string>> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }

const codePoint = (n: number, text: string) => (n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : text)

/** Store text is HTML: the tags go, line breaks stay, and entities decode. */
const plainText = (html: string) =>
  html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&(?:#(\d+)|#x([0-9a-f]+)|([a-z]+));/gi, (text, decimal?: string, hex?: string, name?: string) =>
      decimal !== undefined ? codePoint(Number(decimal), text) : hex !== undefined ? codePoint(Number.parseInt(hex, 16), text) : (entities[name?.toLowerCase() ?? ''] ?? text),
    )
    .replace(/[^\S\n]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

/** Reads one appdetails answer. Anything but a game (a DLC, a demo, a soundtrack) is refused. */
export const parseAppDetails = (appid: SteamAppId, body: unknown): Result.Result<SteamGame, SteamUnavailable> =>
  Option.match(Schema.decodeUnknownOption(Body)(body), {
    onNone: () => Result.fail(new SteamUnavailable({ reason: 'sin_respuesta' })),
    onSome: (answers) => {
      const data = answers[String(appid)]?.data
      if (data === undefined) return Result.fail(new SteamUnavailable({ reason: 'no_encontrado' }))
      if (data.type !== 'game') return Result.fail(new SteamUnavailable({ reason: 'no_es_juego' }))
      return Result.succeed({ appid: data.steam_appid, title: plainText(data.name), description: plainText(data.short_description) })
    },
  })

/** Fetches one game's store data for a reviewer, giving up after five seconds. */
export const steamGame = (appid: SteamAppId) =>
  Effect.gen(function* () {
    yield* requireReviewer
    const body = yield* Effect.tryPromise({
      try: async (signal) => {
        const url = `https://store.steampowered.com/api/appdetails?appids=${appid}&l=spanish`
        const response = await fetch(url, { signal: AbortSignal.any([signal, AbortSignal.timeout(TIMEOUT_MS)]) })
        if (!response.ok) throw new Error(`appdetails answered ${response.status}`)
        const json: unknown = await response.json()
        return json
      },
      catch: (cause) => cause,
    }).pipe(
      Effect.tapError((cause) => Effect.logWarning('Steam appdetails failed', cause)),
      Effect.mapError(() => new SteamUnavailable({ reason: 'sin_respuesta' })),
    )
    return yield* Effect.fromResult(parseAppDetails(appid, body))
  })
