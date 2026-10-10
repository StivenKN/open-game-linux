// Sign-up and sign-in through better-auth's browser client, shaped for useAccion. The leading '-'
// keeps the router from treating this file as a route.
import { Schema } from 'effect'
import type { Respuesta } from '../dominio/fallos.ts'
import { Usuario } from '../dominio/tablas.ts'
import type { Errores } from '../ui/useAccion.ts'
import { authCliente } from './-auth-cliente.ts'

// Same limits as the usuario CHECKs, so the DB never sees a value it would refuse.
const correo = Usuario.fields.correo.pipe(
  Schema.check(Schema.isPattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, { message: 'Escribe un correo válido.' })),
)
// better-auth's defaults; it refuses anything outside them with PASSWORD_TOO_SHORT/LONG.
const contrasena = Schema.String.pipe(
  Schema.check(Schema.isMinLength(8, { message: 'Usa al menos 8 caracteres.' })),
  Schema.check(Schema.isMaxLength(128, { message: 'Usa como máximo 128 caracteres.' })),
)

export const Registro = Schema.Struct({ alias: Usuario.fields.alias, correo, contrasena })
export const Entrada = Schema.Struct({ correo, contrasena: Schema.String.pipe(Schema.check(Schema.isNonEmpty({ message: 'Escribe tu contraseña.' }))) })

/** better-auth reports failures as an error code. Codes we do not expect land on the whole form. */
type FalloCuenta = { readonly codigo: string | undefined }

const respuesta = (error: { readonly code?: string | undefined } | null): Respuesta<null, FalloCuenta> =>
  error === null ? { ok: true, valor: null } : { ok: false, fallo: { codigo: error.code } }

export const registrar = async ({ data }: { readonly data: typeof Registro.Encoded }) =>
  respuesta((await authCliente.signUp.email({ name: data.alias, email: data.correo, password: data.contrasena })).error)

export const entrar = async ({ data }: { readonly data: typeof Entrada.Encoded }) =>
  respuesta((await authCliente.signIn.email({ email: data.correo, password: data.contrasena })).error)

const mensajes: Readonly<Partial<Record<string, Errores>>> = {
  USER_ALREADY_EXISTS: { correo: 'Ya existe una cuenta con ese correo. ¿Quieres entrar?' },
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: { correo: 'Ya existe una cuenta con ese correo. ¿Quieres entrar?' },
  INVALID_EMAIL: { correo: 'Escribe un correo válido.' },
  PASSWORD_TOO_SHORT: { contrasena: 'Usa al menos 8 caracteres.' },
  PASSWORD_TOO_LONG: { contrasena: 'Usa como máximo 128 caracteres.' },
  INVALID_EMAIL_OR_PASSWORD: { formulario: 'El correo o la contraseña no coinciden.' },
}

export const erroresDeCuenta = (f: FalloCuenta): Errores =>
  (f.codigo === undefined ? undefined : mensajes[f.codigo]) ?? { formulario: 'No pudimos completar la operación. Intenta de nuevo.' }

// Where to go after signing in or up. A closed list, so the parameter cannot become an open redirect.
const destinos = ['/diagnostico/importar'] as const
const esDestino = Schema.is(Schema.Literals(destinos))

/** validateSearch for /entrar and /registro: `?volver=` keeps only a known destination. */
export const Volver = (search: Record<string, unknown>): { readonly volver?: (typeof destinos)[number] } =>
  esDestino(search.volver) ? { volver: search.volver } : {}
