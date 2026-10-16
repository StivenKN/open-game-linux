import { Schema } from 'effect'
import type { Reply } from '../domain/errors.ts'
import { User } from '../domain/tables.ts'
import type { FieldErrors } from '../ui/useAction.ts'
import { authClient } from './-auth-client.ts'

const email = User.fields.email.pipe(
  Schema.check(Schema.isPattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, { message: 'Escribe un correo válido.' })),
)
// better-auth's defaults; it refuses anything outside them with PASSWORD_TOO_SHORT/LONG.
const password = Schema.String.pipe(
  Schema.check(Schema.isMinLength(8, { message: 'Usa al menos 8 caracteres.' })),
  Schema.check(Schema.isMaxLength(128, { message: 'Usa como máximo 128 caracteres.' })),
)

export const SignUp = Schema.Struct({ alias: User.fields.alias, email, password })
export const SignIn = Schema.Struct({ email, password: Schema.String.pipe(Schema.check(Schema.isNonEmpty({ message: 'Escribe tu contraseña.' }))) })

type AccountFailure = { readonly code: string | undefined }

// Its rate limiter (production only) answers 429 with no code, so the status names that one.
const reply = (error: { readonly code?: string | undefined; readonly status: number } | null): Reply<null, AccountFailure> =>
  error === null ? { ok: true, value: null } : { ok: false, error: { code: error.code ?? (error.status === 429 ? 'DEMASIADOS_INTENTOS' : undefined) } }

export const signUp = async ({ data }: { readonly data: typeof SignUp.Encoded }) =>
  reply((await authClient.signUp.email({ name: data.alias, email: data.email, password: data.password })).error)

export const signIn = async ({ data }: { readonly data: typeof SignIn.Encoded }) =>
  reply((await authClient.signIn.email({ email: data.email, password: data.password })).error)

const messages: Readonly<Partial<Record<string, FieldErrors>>> = {
  USER_ALREADY_EXISTS: { email: 'Ya existe una cuenta con ese correo. ¿Quieres entrar?' },
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: { email: 'Ya existe una cuenta con ese correo. ¿Quieres entrar?' },
  INVALID_EMAIL: { email: 'Escribe un correo válido.' },
  DOMINIO_RESERVADO: { email: 'Ese dominio está reservado para los datos de ejemplo. Usa otro correo.' },
  PASSWORD_TOO_SHORT: { password: 'Usa al menos 8 caracteres.' },
  PASSWORD_TOO_LONG: { password: 'Usa como máximo 128 caracteres.' },
  INVALID_EMAIL_OR_PASSWORD: { formulario: 'El correo o la contraseña no coinciden.' },
  DEMASIADOS_INTENTOS: { formulario: 'Demasiados intentos seguidos. Espera unos segundos y vuelve a intentarlo.' },
}

export const accountErrors = (f: AccountFailure): FieldErrors =>
  (f.code === undefined ? undefined : messages[f.code]) ?? { formulario: 'No pudimos completar la operación. Intenta de nuevo.' }
