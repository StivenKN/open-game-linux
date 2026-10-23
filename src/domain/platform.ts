import { Schema } from 'effect'

/** x86-64 psABI level glibc reports as supported. v2 includes SSE4.2, v3 AVX2, v4 AVX-512. */
export const X86Level = Schema.Literals(['v1', 'v2', 'v3', 'v4'])
export type X86Level = typeof X86Level.Type

/** `bios`: booted without UEFI, so Secure Boot cannot exist. */
export const SecureBoot = Schema.Literals(['activo', 'inactivo', 'bios'])
export type SecureBoot = typeof SecureBoot.Type

export const Tpm = Schema.Literals(['2.0', '1.2', 'no_detectado'])
export type Tpm = typeof Tpm.Type

/** A handheld the detector recognizes from DMI. NULL on a diagnostic: any other computer, or not captured. */
export const Device = Schema.Literals(['steam_deck_lcd', 'steam_deck_oled'])
export type Device = typeof Device.Type
