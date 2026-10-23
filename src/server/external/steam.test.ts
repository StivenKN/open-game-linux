import { readFileSync } from 'node:fs'
import { describe, expect, it } from '@effect/vitest'
import { Result } from 'effect'
import { SteamUnavailable } from '../../domain/errors.ts'
import { SteamAppId } from '../../domain/library.ts'
import { parseAppDetails } from './steam.ts'

// Answers recorded from store.steampowered.com/api/appdetails?appids=<id>&l=spanish on 2026-10-23.
const recorded = (appid: number): unknown => JSON.parse(readFileSync(new URL(`./fixtures/steam-appdetails-${appid}.json`, import.meta.url), 'utf8'))

const cyberpunk = SteamAppId.make(1091500)
const answer = (data: Record<string, unknown>) => ({ [String(cyberpunk)]: { success: true, data: { type: 'game', name: 'n', steam_appid: 1091500, short_description: '', ...data } } })
const failure = (reason: SteamUnavailable['reason']) => Result.fail(new SteamUnavailable({ reason }))

describe('parseAppDetails', () => {
  it('reads a recorded game: title, Spanish description and App ID', () => {
    expect(parseAppDetails(cyberpunk, recorded(1091500))).toEqual(
      Result.succeed({
        appid: cyberpunk,
        title: 'Cyberpunk 2077',
        description:
          'Cyberpunk 2077 es un RPG de aventura y acción de mundo abierto ambientado en el futuro sombrío de Night City, una peligrosa megalópolis obsesionada con el poder, el glamur y las incesantes modificaciones corporales.',
      }),
    )
  })

  it('an App ID the store does not know is no_encontrado', () => {
    expect(parseAppDetails(SteamAppId.make(1), recorded(1))).toEqual(failure('no_encontrado'))
    expect(parseAppDetails(SteamAppId.make(2), recorded(1))).toEqual(failure('no_encontrado'))
  })

  it('a DLC, a demo or a soundtrack is no_es_juego', () => {
    expect(parseAppDetails(cyberpunk, answer({ type: 'dlc' }))).toEqual(failure('no_es_juego'))
  })

  it('an answer of another shape is sin_respuesta', () => {
    for (const body of [null, 'Access Denied', [], { [String(cyberpunk)]: { success: true, data: [] } }])
      expect(parseAppDetails(cyberpunk, body)).toEqual(failure('sin_respuesta'))
  })

  it('turns store HTML into plain text, and keeps the App ID Steam answers with', () => {
    const parsed = parseAppDetails(
      cyberpunk,
      answer({ steam_appid: 1091240, name: ' Baldur&#39;s Gate 3 ', short_description: '<b>Rol</b> &amp; táctica&nbsp;<br />por turnos &#x2014; con   amigos &bogus; &#99999999;' }),
    )
    expect(parsed).toEqual(Result.succeed({ appid: 1091240, title: "Baldur's Gate 3", description: 'Rol & táctica\npor turnos — con amigos &bogus; &#99999999;' }))
  })
})
