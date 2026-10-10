// The one form hook. Plain React state; Effect appears only as Schema, with no runtime in the browser.
//
//   const r = useAccion(NuevoReporte, registrarReporteFn, { alFallar: erroresDeRegla, alCompletar })
//   <form onSubmit={r.enviar} noValidate> ... <ErrorCampo errores={r.errores} campo="perfil_id" />
//
// 1. Decodes the FormData with the SAME schema the server fn validates with: field errors, no request.
// 2. Calls the fn with the re-encoded value (its `data` is the schema's Encoded type).
// 3. Narrows the returned Respuesta: ok -> alCompletar(valor), else alFallar(fallo) -> field errors.
//
// onSubmit rather than <form action>: React 19 resets an action form's fields after every action,
// which would wipe what the user typed whenever we show an error.
import { type FormEvent, useState } from 'react'
import { isNotFound, isRedirect, useRouter } from '@tanstack/react-router'
import { Option, Result, Schema, SchemaIssue } from 'effect'
import { reglas, type Regla, type Respuesta } from '../dominio/fallos.ts'

/**
 * Field errors keyed by the input's `name` (`perfil_id`, `fallos[0][detalle]`), or `formulario` for
 * errors that belong to no single field. Only the first error per field is kept.
 */
export type Errores = Readonly<Partial<Record<string, string>>>

// Effect's length checks describe themselves in this annotation; TextoHasta(n) fields rely on it.
const Longitud = Schema.Struct({
  representation: Schema.Union([
    Schema.Struct({ id: Schema.Literal('effect/schema/isMaxLength'), payload: Schema.Struct({ maxLength: Schema.Number }) }),
    Schema.Struct({ id: Schema.Literal('effect/schema/isMinLength'), payload: Schema.Struct({ minLength: Schema.Number }) }),
  ]),
})

const formatear = SchemaIssue.makeFormatterStandardSchemaV1({
  leafHook: (issue) => (issue._tag === 'MissingKey' ? 'Este campo es obligatorio.' : 'Revisa este valor.'),
  // A check's own `message` annotation (Texto's 'Este campo es obligatorio.') wins over these.
  checkHook: (issue) =>
    SchemaIssue.defaultCheckHook(issue) ??
    Option.match(Schema.decodeUnknownOption(Longitud)(issue.filter.annotations), {
      onNone: () => 'Revisa este valor.',
      onSome: ({ representation: r }) =>
        r.id === 'effect/schema/isMaxLength' ? `Usa como máximo ${r.payload.maxLength} caracteres.` : `Usa al menos ${r.payload.minLength} caracteres.`,
    }),
})

/** Rebuilds the bracket name a form input uses for this path: ['fallos', 0, 'detalle'] -> 'fallos[0][detalle]'. */
const nombreDeCampo = (camino: ReadonlyArray<PropertyKey | { readonly key: PropertyKey }>): string => {
  const [primero, ...resto] = camino.map((k) => String(typeof k === 'object' ? k.key : k))
  return primero === undefined ? 'formulario' : primero + resto.map((k) => `[${k}]`).join('')
}

export const erroresDeIssue = (issue: SchemaIssue.Issue): Errores => {
  const errores: Record<string, string> = {}
  for (const i of formatear(issue).issues) errores[nombreDeCampo(i.path ?? [])] ??= i.message
  return errores
}

/**
 * Decodes a submitted form with `esquema` (probes.md (a): a nullable field posts the text "null"),
 * then re-encodes it into what the server fn's validator expects. Pure, so tests call it directly.
 */
export const leerFormulario = <T, E>(esquema: Schema.Codec<T, E>, form: FormData): Result.Result<E, Errores> =>
  Schema.decodeUnknownResult(Schema.fromFormData(Schema.toCodecStringTree(esquema)))(form, { errors: 'all' }).pipe(
    Result.map(Schema.encodeSync(esquema)),
    Result.mapError((e) => erroresDeIssue(e.issue)),
  )

/** The usual alFallar: a violated rule lands on its field with its message (dominio/fallos.ts `reglas`). */
export const erroresDeRegla = (f: { readonly _tag: 'ReglaIncumplida'; readonly regla: Regla }): Errores => ({
  [reglas[f.regla].campo]: reglas[f.regla].mensaje,
})

export function useAccion<T, E, A, F>(
  esquema: Schema.Codec<T, E>,
  fn: (opciones: { readonly data: E }) => Promise<Respuesta<A, F>>,
  manejo: { readonly alFallar: (fallo: F) => Errores; readonly alCompletar: (valor: A) => void | Promise<void> },
) {
  const router = useRouter()
  const [errores, setErrores] = useState<Errores>({})
  const [enviando, setEnviando] = useState(false)

  const ejecutar = async (data: E) => {
    setEnviando(true)
    try {
      const r = await fn({ data })
      if (r.ok) {
        setErrores({})
        await manejo.alCompletar(r.valor)
      } else setErrores(manejo.alFallar(r.fallo))
    } catch (e) {
      // leer/accion turn NoAutenticado into a redirect; outside a loader nobody else follows it.
      if (isRedirect(e)) await router.navigate(router.resolveRedirect(e).options)
      else if (isNotFound(e)) setErrores({ formulario: 'Lo que intentas modificar ya no existe o no tienes acceso.' })
      else setErrores({ formulario: 'Algo falló de nuestro lado. Intenta de nuevo.' })
    } finally {
      setEnviando(false)
    }
  }

  const enviar = (evento: FormEvent<HTMLFormElement>) => {
    evento.preventDefault()
    if (enviando) return
    // The submitter carries its own name/value (the review page's Aprobar/Rechazar buttons).
    const boton = evento.nativeEvent instanceof SubmitEvent ? evento.nativeEvent.submitter : null
    const leido = leerFormulario(esquema, new FormData(evento.currentTarget, boton))
    if (Result.isFailure(leido)) setErrores(leido.failure)
    else void ejecutar(leido.success)
  }

  return { enviar, errores, enviando }
}
