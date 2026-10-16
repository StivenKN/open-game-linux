import crypto from 'node:crypto'
import { syncBuiltinESMExports } from 'node:module'

if (process.env.FREEZE_AT) {
  const frozen = Date.parse(process.env.FREEZE_AT)
  const RealDate = Date
  globalThis.Date = class extends RealDate {
    constructor(...args) {
      if (args.length === 0) super(frozen)
      else super(...args)
    }
    static now() {
      return frozen
    }
  }
}

if (process.env.SEED_RANDOM) {
  let state = Number(process.env.SEED_RANDOM) >>> 0
  const mulberry32 = () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return (t ^ (t >>> 14)) >>> 0
  }
  const fill = (view) => {
    const bytes = new Uint8Array(view.buffer, view.byteOffset, view.byteLength)
    for (let i = 0; i < bytes.length; i++) bytes[i] = mulberry32() & 0xff
    return view
  }
  const randomUUID = () => {
    const b = fill(new Uint8Array(16))
    b[6] = (b[6] & 0x0f) | 0x40
    b[8] = (b[8] & 0x3f) | 0x80
    const h = Buffer.from(b).toString('hex')
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
  }

  Math.random = () => mulberry32() / 2 ** 32
  // node:crypto's own getRandomValues is not configurable and forwards to globalThis.crypto.
  Object.defineProperty(globalThis.crypto, 'getRandomValues', { value: fill, configurable: true, writable: true })
  Object.defineProperty(globalThis.crypto, 'randomUUID', { value: randomUUID, configurable: true, writable: true })
  crypto.randomUUID = randomUUID
  crypto.randomFillSync = fill
  crypto.randomBytes = (size, callback) => {
    const buffer = fill(Buffer.alloc(size))
    if (callback === undefined) return buffer
    callback(null, buffer)
  }
  syncBuiltinESMExports()
}
