// Placeholder so the header can link here; U6 replaces it.
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/diagnostico/')({ component: Diagnostico })

function Diagnostico() {
  return (
    <main className="envoltura">
      <h1>Diagnóstico de tu equipo</h1>
      <p className="tenue">Esta sección todavía está en construcción.</p>
    </main>
  )
}
