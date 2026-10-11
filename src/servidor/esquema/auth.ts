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
