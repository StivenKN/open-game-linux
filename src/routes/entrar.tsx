import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import { ErrorCampo, idError } from '../ui/ErrorCampo.tsx'
import { useAccion } from '../ui/useAccion.ts'
import { Entrada, entrar, erroresDeCuenta } from './-cuenta.ts'
import { Volver } from './-volver.ts'

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
        <input
          id="correo"
          name="correo"
          type="email"
          autoComplete="email"
          aria-invalid={r.errores.correo !== undefined}
          aria-describedby={idError('correo')}
        />
        <ErrorCampo errores={r.errores} campo="correo" />
        <label htmlFor="contrasena">Contraseña</label>
        <input
          id="contrasena"
          name="contrasena"
          type="password"
          autoComplete="current-password"
          aria-invalid={r.errores.contrasena !== undefined}
          aria-describedby={idError('contrasena')}
        />
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
