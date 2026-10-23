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
