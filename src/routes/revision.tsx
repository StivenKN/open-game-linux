// Placeholder so the header can link here; U5 replaces it.
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/revision')({ component: Revision })

function Revision() {
  return (
    <main className="envoltura">
      <h1>Revisión de aportes</h1>
      <p className="tenue">Esta sección todavía está en construcción.</p>
    </main>
  )
}
