// The one form hook. Plain React state; Effect appears only as Schema (decode/encode), no runtime.
//
//   const r = useAccion(NuevoReporte, registrarReporteFn, { alFallar: erroresDeRegla, alCompletar })
//   <form action={r.enviar}> ... <ErrorCampo errores={r.errores} campo="perfil_id" />
//
// 1. Decodes the FormData with the SAME schema the server fn validates with -> field errors, no request.
// 2. Encodes the decoded value and calls the server fn (typed: data is the schema's Encoded type).
// 3. Narrows the returned Respuesta: ok -> alCompletar(valor); !ok -> alFallar(fallo) -> field errors.
import { useState } from 'react'
import { Result, Schema, SchemaIssue } from 'effect'
import { reglas, type Respuesta } from '../dominio/fallos.ts'

export type Errores = Readonly<Record<string, string>>

/** Spanish defaults for structural issues; checks with a `message` annotation keep their own text. */
const formatear = SchemaIssue.makeFormatterStandardSchemaV1({
  leafHook: (issue) => (issue._tag === 'MissingKey' ? 'Este campo es obligatorio.' : 'Revisa este valor.'),
})

const erroresDeIssue = (issue: SchemaIssue.Issue): Errores => {
  const errores: Record<string, string> = {}
  for (const i of formatear(issue).issues) {
    const campo = String(i.path?.[0] ?? 'formulario')
    errores[campo] ??= i.message
  }
  return errores
}

/** The usual alFallar: a violated rule lands on its field with its message (dominio/fallos.ts `reglas`). */
export const erroresDeRegla = (f: { readonly _tag: 'ReglaIncumplida'; readonly regla: keyof typeof reglas }): Errores => ({
  [reglas[f.regla].campo]: reglas[f.regla].mensaje,
})

export function useAccion<T, E, A, F>(
  esquema: Schema.Codec<T, E>,
  fn: (opciones: { data: E }) => Promise<Respuesta<A, F>>,
  manejo: { readonly alFallar: (fallo: F) => Errores; readonly alCompletar: (valor: A) => void },
) {
  const [errores, setErrores] = useState<Errores>({})
  const [enviando, setEnviando] = useState(false)
  const desdeFormulario = Schema.fromFormData(Schema.toCodecStringTree(esquema))

  const enviar = async (form: FormData) => {
    const decodificado = Schema.decodeUnknownResult(desdeFormulario)(form)
    if (Result.isFailure(decodificado)) return setErrores(erroresDeIssue(decodificado.failure.issue))
    setEnviando(true)
    try {
      const r = await fn({ data: Schema.encodeSync(esquema)(decodificado.success) })
      if (r.ok) {
        setErrores({})
        manejo.alCompletar(r.valor)
      } else setErrores(manejo.alFallar(r.fallo))
    } finally {
      setEnviando(false)
    }
  }

  return { enviar, errores, enviando }
}
