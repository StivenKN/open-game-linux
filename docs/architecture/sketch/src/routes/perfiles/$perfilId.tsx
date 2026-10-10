// Profile page (replaces the 9.4 wizard): ordered manual steps with copy buttons and a local
// progress checklist. Nothing is downloaded or executed (8.5).
import { Link, createFileRoute } from '@tanstack/react-router'
import { perfilFn } from '../../fns/catalogo.ts'

export const Route = createFileRoute('/perfiles/$perfilId')({
  loader: ({ params }) => perfilFn({ data: { perfilId: params.perfilId } }),
  component: () => {
    const { perfil, pasos } = Route.useLoaderData()
    return (
      <main>
        <h1>{perfil.titulo} r{perfil.revision}</h1>
        <ol>{pasos.map((p) => <li key={p.orden}>{p.titulo}</li>)}</ol>
        <Link to="/juegos/$juegoId/reportar" params={{ juegoId: String(perfil.juego_id) }} search={{ perfil: perfil.id }}>
          Reportar resultado con este perfil
        </Link>
      </main>
    )
  },
})
