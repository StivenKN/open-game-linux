import { describe, expect, it } from '@effect/vitest'
import { Option } from 'effect'
import { blocksOnlinePlay, type ListedGame, parseListedGame, preferred } from './anticheat.ts'

const entry = (changes: object = {}) =>
  JSON.stringify({
    url: '',
    name: 'Juego inventado',
    logo: '',
    native: false,
    status: 'Denied',
    reference: '',
    anticheats: ['Anti-cheat inventado', 'Otro anti-cheat'],
    notes: [['Una nota', 'https://example.test']],
    updates: [],
    storeIds: { steam: '1000' },
    slug: 'juego-inventado',
    dateChanged: '2025-08-07T20:28:01.0000000-04:00',
    ...changes,
  })

describe('parseListedGame', () => {
  it('reads the status, anti-cheats, Steam app id, slug and change date, whatever offset the date carries', () => {
    expect(parseListedGame(entry())).toEqual(
      Option.some({
        app_id: '1000',
        status: 'Denied',
        anticheats: ['Anti-cheat inventado', 'Otro anti-cheat'],
        changed_at: new Date('2025-08-08T00:28:01Z'),
        slug: 'juego-inventado',
      }),
    )
  })

  it('a game sold outside Steam has no app id, and a date that does not parse is unknown, not a reason to drop the entry', () => {
    const r = parseListedGame(entry({ storeIds: { epic: { namespace: 'x', slug: 'y' } }, dateChanged: '2025-10-30T04:00:000Z' }))
    expect(Option.map(r, (g) => [g.app_id, g.changed_at])).toEqual(Option.some([null, null]))
  })

  it('anything that is not a usable entry is none', () => {
    expect(parseListedGame(entry({ status: 'Unknown' }))).toEqual(Option.none())
    expect(parseListedGame(entry({ slug: '  ' }))).toEqual(Option.none())
    expect(parseListedGame(entry({ anticheats: ['x'.repeat(81)] }))).toEqual(Option.none())
    expect(parseListedGame('{"status":')).toEqual(Option.none())
    expect(parseListedGame('')).toEqual(Option.none())
  })
})

describe('preferred', () => {
  const game = (slug: string, changed_at: Date | null): ListedGame => ({ app_id: '1000', status: 'Denied', anticheats: [], changed_at, slug })

  it('keeps the most recently changed entry for an app id, an unknown date counting as oldest', () => {
    const old = game('siege', new Date('2024-09-22T00:00:00Z'))
    const recent = game('siege-x', new Date('2025-08-07T00:00:00Z'))
    expect(preferred(old, recent)).toBe(recent)
    expect(preferred(recent, old)).toBe(recent)
    expect(preferred(game('sin-fecha', null), old)).toBe(old)
  })

  it('on a tie, the first slug, in either order', () => {
    const a = game('a', null)
    const b = game('b', null)
    expect(preferred(a, b)).toBe(a)
    expect(preferred(b, a)).toBe(a)
  })
})

describe('blocksOnlinePlay', () => {
  it('only Broken and Denied keep a game out of "sin bloqueo anti-cheat"', () => {
    expect(['Supported', 'Running', 'Planned', 'Broken', 'Denied'].filter(blocksOnlinePlay)).toEqual(['Broken', 'Denied'])
  })
})
