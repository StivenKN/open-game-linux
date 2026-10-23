// onSubmit rather than <form action>: React 19 resets an action form's fields after every action,
// which would wipe what the user typed whenever we show an error. `method="post"` covers a submit
// before hydration: the browser's default GET would put every field, passwords included, in the URL.
import { type FormEvent, useRef, useState } from 'react'
import { isNotFound, isRedirect, useRouter } from '@tanstack/react-router'
import { Option, Result, Schema, SchemaIssue } from 'effect'
import { CheckMessage } from '../domain/checks.ts'
import { ruleField, type Rule, type Reply } from '../domain/errors.ts'
import type { Messages } from './i18n/es.ts'
import { useT } from './i18n/messages.ts'

export type FieldErrors = Readonly<Partial<Record<string, string>>>

// Effect's length checks describe themselves in this annotation.
const LengthCheck = Schema.Struct({
  representation: Schema.Union([
    Schema.Struct({ id: Schema.Literal('effect/schema/isMaxLength'), payload: Schema.Struct({ maxLength: Schema.Number }) }),
    Schema.Struct({ id: Schema.Literal('effect/schema/isMinLength'), payload: Schema.Struct({ minLength: Schema.Number }) }),
  ]),
})

const isCheckMessage = Schema.is(CheckMessage)

// A domain check carries a code (`says`); a length check describes itself in its annotation.
const checkMessage = (issue: SchemaIssue.Filter, t: Messages): string => {
  const code = SchemaIssue.defaultCheckHook(issue)
  if (code !== undefined) return isCheckMessage(code) ? t.checks[code] : t.forms.checkValue
  return Option.match(Schema.decodeUnknownOption(LengthCheck)(issue.filter.annotations), {
    onNone: () => t.forms.checkValue,
    onSome: ({ representation: r }) => (r.id === 'effect/schema/isMaxLength' ? t.forms.maxLength(r.payload.maxLength) : t.forms.minLength(r.payload.minLength)),
  })
}

/**
 * Flattens an issue tree into messages in the page's language, with their paths. Effect's own formatter
 * falls back to an English type dump for a union that matches no member (a bad `_tag`, a checkbox posting
 * "on"); here every node has a message from the dictionary. Such a union reports at its own name (`layer_version`).
 */
const flatten = (issue: SchemaIssue.Issue, path: ReadonlyArray<PropertyKey>, t: Messages): ReadonlyArray<readonly [ReadonlyArray<PropertyKey>, string]> => {
  switch (issue._tag) {
    case 'Pointer':
      return flatten(issue.issue, [...path, ...issue.path], t)
    case 'Encoding':
      return flatten(issue.issue, path, t)
    case 'Composite':
      return issue.issues.flatMap((i) => flatten(i, path, t))
    case 'AnyOf':
      return issue.issues.length === 0 ? [[path, t.forms.checkValue]] : issue.issues.flatMap((i) => flatten(i, path, t))
    case 'Filter':
      return issue.issue._tag === 'InvalidValue' ? [[path, checkMessage(issue, t)]] : flatten(issue.issue, path, t)
    case 'MissingKey':
      return [[path, t.checks.required]]
    default:
      return [[path, t.forms.checkValue]]
  }
}

const fieldName = (path: ReadonlyArray<PropertyKey>): string => {
  const [first, ...rest] = path.map(String)
  return first === undefined ? 'form' : first + rest.map((k) => `[${k}]`).join('')
}

export const issueErrors = (issue: SchemaIssue.Issue, t: Messages): FieldErrors => {
  const errors: Record<string, string> = {}
  for (const [path, message] of flatten(issue, [], t)) errors[fieldName(path)] ??= message
  return errors
}

export const readForm = <T, E>(schema: Schema.Codec<T, E>, form: FormData, t: Messages): Result.Result<E, FieldErrors> =>
  Schema.decodeUnknownResult(Schema.fromFormData(Schema.toCodecStringTree(schema)))(form, { errors: 'all' }).pipe(
    Result.map(Schema.encodeSync(schema)),
    Result.mapError((e) => issueErrors(e.issue, t)),
  )

export const ruleErrors = (f: { readonly _tag: 'ReglaIncumplida'; readonly rule: Rule }, t: Messages): FieldErrors => ({ [ruleField[f.rule]]: t.rules[f.rule] })

export function useAction<T, E, A, F>(
  schema: Schema.Codec<T, E>,
  fn: (options: { readonly data: E }) => Promise<Reply<A, F>>,
  handlers: { readonly onFailure: (failure: F, t: Messages) => FieldErrors; readonly onComplete: (value: A) => void | Promise<void> },
) {
  const router = useRouter()
  const t = useT()
  const [errors, setErrors] = useState<FieldErrors>({})
  const [submitting, setSubmitting] = useState(false)
  // State lags a render behind, so a double click in one tick would pass a state check twice.
  const inFlight = useRef(false)

  const onThrow = async (e: unknown) => {
    // runRead/runAction turn Unauthenticated into a redirect; outside a loader nobody else follows it.
    if (isRedirect(e)) await router.navigate(router.resolveRedirect(e).options)
    else if (isNotFound(e)) setErrors({ form: t.forms.gone })
    else setErrors({ form: t.forms.failed })
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
    } else setErrors(handlers.onFailure(r.error, t))
  }

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (inFlight.current) return
    // The submitter carries its own name/value (the review page's Aprobar/Rechazar buttons).
    const submitter = event.nativeEvent instanceof SubmitEvent ? event.nativeEvent.submitter : null
    const parsed = readForm(schema, new FormData(event.currentTarget, submitter), t)
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
