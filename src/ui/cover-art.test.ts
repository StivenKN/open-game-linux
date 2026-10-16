import { expect, it } from '@effect/vitest'
import { coverDesign } from './cover-art.ts'

// Expected values come from running the seeding code of the approved "C · Biblioteca" design prototype.
it('seeds the same cover as the approved prototype for each title', () => {
  const coverOf = (title: string) => {
    const { hue, motif, caption } = coverDesign(title)
    return { hue, motif, narrow: caption.narrow, atTop: caption.atTop }
  }
  expect(coverOf('Grand Theft Auto V')).toEqual({ hue: 218, motif: 'franjas', narrow: false, atTop: true })
  expect(coverOf('Valorant')).toEqual({ hue: 197, motif: 'sol', narrow: false, atTop: true })
  expect(coverOf('The Witcher 3: Wild Hunt')).toEqual({ hue: 103, motif: 'picos', narrow: true, atTop: true })
  expect(coverOf('Counter-Strike 2')).toEqual({ hue: 322, motif: 'bloques', narrow: false, atTop: false })
})

it('sizes the cover title by its longest word', () => {
  expect(coverDesign('Valorant').caption.size).toBe(12.78)
  expect(coverDesign('The Witcher 3: Wild Hunt').caption.size).toBe(23.38)
})
