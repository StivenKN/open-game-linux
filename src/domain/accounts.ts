import { Schema } from 'effect'
import { Checkbox, UserId } from './ids.ts'
import { Role } from './review.ts'

/** /admin/usuarios posts one account's whole access; `changeAccess` applies it. */
export const AccessChange = Schema.Struct({ user_id: UserId, role: Role, active: Checkbox })
export type AccessChange = typeof AccessChange.Type

/** What an account may do: its role, and whether it counts as signed in at all (`visitorOf`). */
export type Access = Pick<AccessChange, 'role' | 'active'>

/** An administrador only counts while the account is active: a deactivated one is a guest on every request. */
export const isActiveAdmin = (a: Access) => a.active && a.role === 'administrador'

/**
 * The better-auth error codes the sign-in and sign-up forms explain, with the field each message goes under.
 * `server/auth.ts` raises the two Spanish ones; the others are better-auth's own.
 */
export const accountFailureField = {
  USER_ALREADY_EXISTS: 'email',
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: 'email',
  INVALID_EMAIL: 'email',
  DOMINIO_RESERVADO: 'email',
  PASSWORD_TOO_SHORT: 'password',
  PASSWORD_TOO_LONG: 'password',
  INVALID_EMAIL_OR_PASSWORD: 'form',
  CUENTA_DESACTIVADA: 'form',
  TOO_MANY_ATTEMPTS: 'form',
} as const
export type AccountFailureCode = keyof typeof accountFailureField
