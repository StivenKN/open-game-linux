import { describe, expect, it } from '@effect/vitest'
import { encodeSpans, decodeSpans } from './ranges.ts'

describe('spans', () => {
  it('encodes sorted hex runs and decodes them back', () => {
    const ids = [0x0406, 0x0402, 0x0403, 0x0404, 0x0405, 0x040a, 0x040a, 0x1f91]
    expect(encodeSpans(ids)).toBe('0402-0406 040a 1f91')
    expect(decodeSpans(encodeSpans(ids))).toEqual([0x0402, 0x0403, 0x0404, 0x0405, 0x0406, 0x040a, 0x1f91])
    expect([encodeSpans([]), decodeSpans('')]).toEqual(['', []])
  })
})
