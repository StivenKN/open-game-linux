import type { BetterAuthOptions } from 'better-auth'
import type { Role } from '../../domain/review.ts'

export const authSchema = {
  user: {
    modelName: 'app_user',
    fields: { name: 'alias', email: 'email', emailVerified: 'email_verified', createdAt: 'created_at', updatedAt: 'updated_at' },
    additionalFields: {
      // input: false, so sign-up cannot set them. Promotion goes through scripts/rol.ts.
      rol: { type: 'string', input: false, defaultValue: 'usuario' satisfies Role, fieldName: 'role' },
      activo: { type: 'boolean', input: false, defaultValue: true, fieldName: 'active' },
    },
  },
} satisfies BetterAuthOptions
