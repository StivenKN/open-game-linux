import { describe, expect, it } from '@effect/vitest'
import { Result, Schema } from 'effect'
import { SteamStoreRef } from './library.ts'

const decode = Schema.decodeUnknownResult(SteamStoreRef)

describe('SteamStoreRef', () => {
  it.each([
    ['1091500', 1091500],
    [' 1091500 ', 1091500],
    ['https://store.steampowered.com/app/1091500/Cyberpunk_2077/', 1091500],
    ['http://store.steampowered.com/app/1091500?l=spanish', 1091500],
    ['store.steampowered.com/app/1091500#reviews', 1091500],
  ])('reads %s as App ID %i', (input, appid) => {
    expect(decode(input)).toEqual(Result.succeed(appid))
  })

  it.each(['', '0', '01091500', '1234567890', 'https://steamcommunity.com/app/1091500', 'https://store.steampowered.com.evil.test/app/1', 'Cyberpunk 2077'])(
    'refuses %o',
    (input) => {
      expect(Result.isFailure(decode(input))).toBe(true)
    },
  )
})
