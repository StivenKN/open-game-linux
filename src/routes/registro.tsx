import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import { ErrorCampo, idError } from '../ui/ErrorCampo.tsx'
import { useAccion } from '../ui/useAccion.ts'
import { erroresDeCuenta, Registro, registrar, Volver } from './-cuenta.ts'

export const Route = createFileRoute('/registro')({
  head: () => ({ meta: [{ title: 'Crear cuenta · OpenGame Linux' }] }),
  validateSearch: Volver,
  component: CrearCuenta,
})

function CrearCuenta() {
  const router = useRouter()
  const { volver } = Route.useSearch()
  const r = useAccion(Registro, registrar, {
    alFallar: erroresDeCuenta,
    alCompletar: async () => {
      await router.invalidate()
      await router.navigate({ to: volver ?? '/' })
    },
  })
  return (
    <main className="envoltura estrecha">
      <h1>Crear cuenta</h1>
      <p className="tenue">Los demás solo verán tu alias. Tu correo no se muestra en ningún aporte.</p>
      <form className="tarjeta formulario" onSubmit={r.enviar} noValidate>
        <ErrorCampo errores={r.errores} campo="formulario" />
        <label htmlFor="alias">Alias</label>
        <input id="alias" name="alias" autoComplete="nickname" aria-invalid={r.errores.alias !== undefined} aria-describedby={idError('alias')} />
        <ErrorCampo errores={r.errores} campo="alias" />
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
          autoComplete="new-password"
          aria-invalid={r.errores.contrasena !== undefined}
          aria-describedby={idError('contrasena')}
        />
        <ErrorCampo errores={r.errores} campo="contrasena" />
        <button type="submit" disabled={r.enviando}>
          {r.enviando ? 'Creando cuenta…' : 'Crear cuenta'}
        </button>
      </form>
      <p>
        ¿Ya tienes cuenta? <Link to="/entrar" search={volver ? { volver } : {}}>Entra</Link>.
      </p>
    </main>
  )
}
