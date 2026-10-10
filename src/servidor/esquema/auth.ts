// The part of the better-auth config that decides its tables. servidor/auth.ts spreads it into
// betterAuth(), scripts/auth-sql.ts compiles it into migration 1_auth, and tests/esquema.test.ts
// asserts that the real instance (`auth.options`) finds nothing left to migrate, so the config and
// the SQL cannot drift.
import type { BetterAuthOptions } from 'better-auth'
import type { Rol } from '../../dominio/revision.ts'

export const esquemaAuth = {
  user: {
    modelName: 'usuario',
    fields: { name: 'alias', email: 'correo', emailVerified: 'correo_verificado', createdAt: 'creado_en', updatedAt: 'actualizado_en' },
    additionalFields: {
      // input: false, so sign-up cannot set them. Promotion goes through scripts/rol.ts.
      rol: { type: 'string', input: false, defaultValue: 'usuario' satisfies Rol },
      activo: { type: 'boolean', input: false, defaultValue: true },
    },
  },
} satisfies BetterAuthOptions
