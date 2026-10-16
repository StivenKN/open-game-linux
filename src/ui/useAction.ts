// onSubmit rather than <form action>: React 19 resets an action form's fields after every action,
// which would wipe what the user typed whenever we show an error. `method="post"` covers a submit
// before hydration: the browser's default GET would put every field, passwords included, in the URL.
import { type FormEvent, useRef, useState } from 'react'
import { isNotFound, isRedirect, useRouter } from '@tanstack/react-router'
import { Option, Result, Schema, SchemaIssue } from 'effect'
import { rules, type Rule, type Reply } from '../domain/errors.ts'

export type FieldErrors = Readonly<Partial<Record<string, string>>>

// Effect's length checks describe themselves in this annotation; TextoHasta(n) fields rely on it.
const LengthCheck = Schema.Struct({
  representation: Schema.Union([
    Schema.Struct({ id: Schema.Literal('effect/schema/isMaxLength'), payload: Schema.Struct({ maxLength: Schema.Number }) }),
    Schema.Struct({ id: Schema.Literal('effect/schema/isMinLength'), payload: Schema.Struct({ minLength: Schema.Number }) }),
  ]),
})

const checkValue = 'Revisa este valor.'

const checkMessage = (issue: SchemaIssue.Filter): string =>
  SchemaIssue.defaultCheckHook(issue) ??
  Option.match(Schema.decodeUnknownOption(LengthCheck)(issue.filter.annotations), {
    onNone: () => checkValue,
    onSome: ({ representation: r }) =>
      r.id === 'effect/schema/isMaxLength' ? `Usa como máximo ${r.payload.maxLength} caracteres.` : `Usa al menos ${r.payload.minLength} caracteres.`,
  })

/**
 * Flattens an issue tree into Spanish messages with their paths. Effect's own formatter falls back to
 * an English type dump for a union that matches no member (a bad `_tag`, a checkbox posting "on");
 * here every node has a Spanish message. Such a union reports at its own name (`version_capa`).
 */
const flatten = (issue: SchemaIssue.Issue, path: ReadonlyArray<PropertyKey>): ReadonlyArray<readonly [ReadonlyArray<PropertyKey>, string]> => {
  switch (issue._tag) {
    case 'Pointer':
      return flatten(issue.issue, [...path, ...issue.path])
    case 'Encoding':
      return flatten(issue.issue, path)
    case 'Composite':
      return issue.issues.flatMap((i) => flatten(i, path))
    case 'AnyOf':
      return issue.issues.length === 0 ? [[path, checkValue]] : issue.issues.flatMap((i) => flatten(i, path))
    case 'Filter':
      return issue.issue._tag === 'InvalidValue' ? [[path, checkMessage(issue)]] : flatten(issue.issue, path)
    case 'MissingKey':
      return [[path, 'Este campo es obligatorio.']]
    default:
      return [[path, checkValue]]
  }
}

const fieldName = (path: ReadonlyArray<PropertyKey>): string => {
  const [first, ...rest] = path.map(String)
  return first === undefined ? 'formulario' : first + rest.map((k) => `[${k}]`).join('')
}

export const issueErrors = (issue: SchemaIssue.Issue): FieldErrors => {
  const errors: Record<string, string> = {}
  for (const [path, message] of flatten(issue, [])) errors[fieldName(path)] ??= message
  return errors
}

export const readForm = <T, E>(schema: Schema.Codec<T, E>, form: FormData): Result.Result<E, FieldErrors> =>
  Schema.decodeUnknownResult(Schema.fromFormData(Schema.toCodecStringTree(schema)))(form, { errors: 'all' }).pipe(
    Result.map(Schema.encodeSync(schema)),
    Result.mapError((e) => issueErrors(e.issue)),
  )

export const ruleErrors = (f: { readonly _tag: 'ReglaIncumplida'; readonly rule: Rule }): FieldErrors => ({
  [rules[f.rule].field]: rules[f.rule].message,
})

export function useAction<T, E, A, F>(
  schema: Schema.Codec<T, E>,
  fn: (options: { readonly data: E }) => Promise<Reply<A, F>>,
  handlers: { readonly onFailure: (failure: F) => FieldErrors; readonly onComplete: (value: A) => void | Promise<void> },
) {
  const router = useRouter()
  const [errors, setErrors] = useState<FieldErrors>({})
  const [submitting, setSubmitting] = useState(false)
  // State lags a render behind, so a double click in one tick would pass a state check twice.
  const inFlight = useRef(false)

  const onThrow = async (e: unknown) => {
    // runRead/runAction turn NoAutenticado into a redirect; outside a loader nobody else follows it.
    if (isRedirect(e)) await router.navigate(router.resolveRedirect(e).options)
    else if (isNotFound(e)) setErrors({ formulario: 'Lo que intentas modificar ya no existe o no tienes acceso.' })
    else setErrors({ formulario: 'Algo falló de nuestro lado. Intenta de nuevo.' })
  }

  const run = async (data: E) => {
    const r = await fn({ data }).then(
      (reply) => reply,
      async (e: unknown) => {
        await onThrow(e)
        return null
      },
    )
    if (r === null) return
    if (r.ok) {
      setErrors({})
      await handlers.onComplete(r.value)
    } else setErrors(handlers.onFailure(r.error))
  }

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (inFlight.current) return
    // The submitter carries its own name/value (the review page's Aprobar/Rechazar buttons).
    const submitter = event.nativeEvent instanceof SubmitEvent ? event.nativeEvent.submitter : null
    const parsed = readForm(schema, new FormData(event.currentTarget, submitter))
    if (Result.isFailure(parsed)) return setErrors(parsed.failure)
    inFlight.current = true
    setSubmitting(true)
    void run(parsed.success).finally(() => {
      inFlight.current = false
      setSubmitting(false)
    })
  }

  return { form: { onSubmit: submit, method: 'post', noValidate: true }, errors, submitting } as const
}
