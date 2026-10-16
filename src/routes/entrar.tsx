import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import { ErrorCampo } from '../ui/FieldError.tsx'
import { campo } from '../ui/form.tsx'
import { useAccion } from '../ui/useAction.ts'
import { Entrada, entrar, erroresDeCuenta } from './-account.ts'
import { Volver } from './-return-to.ts'

export const Route = createFileRoute('/entrar')({
  head: () => ({ meta: [{ title: 'Entrar · OpenGame Linux' }] }),
  validateSearch: Volver,
  component: Entrar,
})

function Entrar() {
  const router = useRouter()
  const { volver } = Route.useSearch()
  const r = useAccion(Entrada, entrar, {
    alFallar: erroresDeCuenta,
    alCompletar: async () => {
      await router.invalidate()
      await router.navigate({ href: volver ?? '/' })
    },
  })
  return (
    <main className="envoltura estrecha">
      <h1>Entrar</h1>
      <p className="tenue">Entra para guardar tu diagnóstico y publicar reportes.</p>
      <form className="tarjeta formulario" {...r.formulario}>
        <ErrorCampo errores={r.errores} campo="formulario" />
        <label htmlFor="correo">Correo</label>
        <input {...campo(r.errores, 'correo')} type="email" autoComplete="email" />
        <ErrorCampo errores={r.errores} campo="correo" />
        <label htmlFor="contrasena">Contraseña</label>
        <input {...campo(r.errores, 'contrasena')} type="password" autoComplete="current-password" />
        <ErrorCampo errores={r.errores} campo="contrasena" />
        <button type="submit" disabled={r.enviando}>
          {r.enviando ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
      <p>
        ¿No tienes cuenta? <Link to="/registro" search={volver ? { volver } : {}}>Crea una</Link>.
      </p>
    </main>
  )
}
