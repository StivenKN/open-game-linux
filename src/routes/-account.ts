import { Schema } from 'effect'
import { accountFailureField } from '../domain/accounts.ts'
import { says } from '../domain/checks.ts'
import type { Reply } from '../domain/errors.ts'
import { User } from '../domain/tables.ts'
import type { Messages } from '../ui/i18n/es.ts'
import type { FieldErrors } from '../ui/useAction.ts'
import { authClient } from './-auth-client.ts'

const email = User.fields.email.pipe(Schema.check(Schema.isPattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, says('email'))))
// better-auth's defaults; it refuses anything outside them with PASSWORD_TOO_SHORT/LONG.
const password = Schema.String.pipe(Schema.check(Schema.isMinLength(8)), Schema.check(Schema.isMaxLength(128)))

export const SignUp = Schema.Struct({ alias: User.fields.alias, email, password })
export const SignIn = Schema.Struct({ email, password: Schema.String.pipe(Schema.check(Schema.isNonEmpty(says('passwordNeeded')))) })

type AccountFailure = { readonly code: string | undefined }

// Its rate limiter (production only) answers 429 with no code, so the status names that one.
const reply = (error: { readonly code?: string | undefined; readonly status: number } | null): Reply<null, AccountFailure> =>
  error === null ? { ok: true, value: null } : { ok: false, error: { code: error.code ?? (error.status === 429 ? 'TOO_MANY_ATTEMPTS' : undefined) } }

export const signUp = async ({ data }: { readonly data: typeof SignUp.Encoded }) =>
  reply((await authClient.signUp.email({ name: data.alias, email: data.email, password: data.password })).error)

export const signIn = async ({ data }: { readonly data: typeof SignIn.Encoded }) =>
  reply((await authClient.signIn.email({ email: data.email, password: data.password })).error)

const isAccountFailure = (code: string | undefined): code is keyof typeof accountFailureField => code !== undefined && Object.hasOwn(accountFailureField, code)

export const accountErrors = (f: AccountFailure, t: Messages): FieldErrors =>
  isAccountFailure(f.code) ? { [accountFailureField[f.code]]: t.accountFailures[f.code] } : { form: t.accountFailed }
