// Placeholder so the header can link here; U4 replaces it.
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/guias/')({ component: Guias })

function Guias() {
  return (
    <main className="envoltura">
      <h1>Guías de adopción</h1>
      <p className="tenue">Esta sección todavía está en construcción.</p>
    </main>
  )
}
