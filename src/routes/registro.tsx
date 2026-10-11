import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import { ErrorCampo } from '../ui/ErrorCampo.tsx'
import { campo } from '../ui/formulario.tsx'
import { useAccion } from '../ui/useAccion.ts'
import { erroresDeCuenta, Registro, registrar } from './-cuenta.ts'
import { Volver } from './-volver.ts'

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
      await router.navigate({ href: volver ?? '/' })
    },
  })
  return (
    <main className="envoltura estrecha">
      <h1>Crear cuenta</h1>
      <p className="tenue">Los demás solo verán tu alias. Tu correo no se muestra en ningún aporte.</p>
      <form className="tarjeta formulario" {...r.formulario}>
        <ErrorCampo errores={r.errores} campo="formulario" />
        <label htmlFor="alias">Alias</label>
        <input {...campo(r.errores, 'alias')} autoComplete="nickname" />
        <ErrorCampo errores={r.errores} campo="alias" />
        <label htmlFor="correo">Correo</label>
        <input {...campo(r.errores, 'correo')} type="email" autoComplete="email" />
        <ErrorCampo errores={r.errores} campo="correo" />
        <label htmlFor="contrasena">Contraseña</label>
        <input {...campo(r.errores, 'contrasena')} type="password" autoComplete="new-password" />
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
