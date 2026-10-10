// Placeholder until U4 builds the catalog here.
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({ component: Inicio })

function Inicio() {
  return (
    <main className="envoltura">
      <h1>Compatibilidad de juegos en Linux</h1>
      <p className="tenue">El catálogo llega pronto. Mientras tanto puedes crear tu cuenta.</p>
    </main>
  )
}
