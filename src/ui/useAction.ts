// onSubmit rather than <form action>: React 19 resets an action form's fields after every action,
// which would wipe what the user typed whenever we show an error. `method="post"` covers a submit
// before hydration: the browser's default GET would put every field, passwords included, in the URL.
import { type FormEvent, useRef, useState } from 'react'
import { isNotFound, isRedirect, useRouter } from '@tanstack/react-router'
import { Option, Result, Schema, SchemaIssue } from 'effect'
import { reglas, type Regla, type Respuesta } from '../domain/errors.ts'

export type Errores = Readonly<Partial<Record<string, string>>>

// Effect's length checks describe themselves in this annotation; TextoHasta(n) fields rely on it.
const Longitud = Schema.Struct({
  representation: Schema.Union([
    Schema.Struct({ id: Schema.Literal('effect/schema/isMaxLength'), payload: Schema.Struct({ maxLength: Schema.Number }) }),
    Schema.Struct({ id: Schema.Literal('effect/schema/isMinLength'), payload: Schema.Struct({ minLength: Schema.Number }) }),
  ]),
})

const revisa = 'Revisa este valor.'

const mensajeDeCheck = (issue: SchemaIssue.Filter): string =>
  SchemaIssue.defaultCheckHook(issue) ??
  Option.match(Schema.decodeUnknownOption(Longitud)(issue.filter.annotations), {
    onNone: () => revisa,
    onSome: ({ representation: r }) =>
      r.id === 'effect/schema/isMaxLength' ? `Usa como máximo ${r.payload.maxLength} caracteres.` : `Usa al menos ${r.payload.minLength} caracteres.`,
  })

/**
 * Flattens an issue tree into Spanish messages with their paths. Effect's own formatter falls back to
 * an English type dump for a union that matches no member (a bad `_tag`, a checkbox posting "on");
 * here every node has a Spanish message. Such a union reports at its own name (`version_capa`).
 */
const aplanar = (issue: SchemaIssue.Issue, camino: ReadonlyArray<PropertyKey>): ReadonlyArray<readonly [ReadonlyArray<PropertyKey>, string]> => {
  switch (issue._tag) {
    case 'Pointer':
      return aplanar(issue.issue, [...camino, ...issue.path])
    case 'Encoding':
      return aplanar(issue.issue, camino)
    case 'Composite':
      return issue.issues.flatMap((i) => aplanar(i, camino))
    case 'AnyOf':
      return issue.issues.length === 0 ? [[camino, revisa]] : issue.issues.flatMap((i) => aplanar(i, camino))
    case 'Filter':
      return issue.issue._tag === 'InvalidValue' ? [[camino, mensajeDeCheck(issue)]] : aplanar(issue.issue, camino)
    case 'MissingKey':
      return [[camino, 'Este campo es obligatorio.']]
    default:
      return [[camino, revisa]]
  }
}

const nombreDeCampo = (camino: ReadonlyArray<PropertyKey>): string => {
  const [primero, ...resto] = camino.map(String)
  return primero === undefined ? 'formulario' : primero + resto.map((k) => `[${k}]`).join('')
}

export const erroresDeIssue = (issue: SchemaIssue.Issue): Errores => {
  const errores: Record<string, string> = {}
  for (const [camino, mensaje] of aplanar(issue, [])) errores[nombreDeCampo(camino)] ??= mensaje
  return errores
}

export const leerFormulario = <T, E>(esquema: Schema.Codec<T, E>, form: FormData): Result.Result<E, Errores> =>
  Schema.decodeUnknownResult(Schema.fromFormData(Schema.toCodecStringTree(esquema)))(form, { errors: 'all' }).pipe(
    Result.map(Schema.encodeSync(esquema)),
    Result.mapError((e) => erroresDeIssue(e.issue)),
  )

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
  // State lags a render behind, so a double click in one tick would pass a state check twice.
  const enCurso = useRef(false)

  const alLanzar = async (e: unknown) => {
    // leer/accion turn NoAutenticado into a redirect; outside a loader nobody else follows it.
    if (isRedirect(e)) await router.navigate(router.resolveRedirect(e).options)
    else if (isNotFound(e)) setErrores({ formulario: 'Lo que intentas modificar ya no existe o no tienes acceso.' })
    else setErrores({ formulario: 'Algo falló de nuestro lado. Intenta de nuevo.' })
  }

  const ejecutar = async (data: E) => {
    const r = await fn({ data }).then(
      (respuesta) => respuesta,
      async (e: unknown) => {
        await alLanzar(e)
        return null
      },
    )
    if (r === null) return
    if (r.ok) {
      setErrores({})
      await manejo.alCompletar(r.valor)
    } else setErrores(manejo.alFallar(r.fallo))
  }

  const enviar = (evento: FormEvent<HTMLFormElement>) => {
    evento.preventDefault()
    if (enCurso.current) return
    // The submitter carries its own name/value (the review page's Aprobar/Rechazar buttons).
    const boton = evento.nativeEvent instanceof SubmitEvent ? evento.nativeEvent.submitter : null
    const leido = leerFormulario(esquema, new FormData(evento.currentTarget, boton))
    if (Result.isFailure(leido)) return setErrores(leido.failure)
    enCurso.current = true
    setEnviando(true)
    void ejecutar(leido.success).finally(() => {
      enCurso.current = false
      setEnviando(false)
    })
  }

  return { formulario: { onSubmit: enviar, method: 'post', noValidate: true }, errores, enviando } as const
}
