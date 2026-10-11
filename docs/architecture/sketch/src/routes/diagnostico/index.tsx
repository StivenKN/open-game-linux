// Diagnosis (wireframe 9.2): download the detector, paste its output, or fill the manual form
// (free-text CPU/GPU + RAM, VRAM, Vulkan; serves Windows users before migrating). Guests evaluate
// without storing; logged-in users also see their equipos and capture history.
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/diagnostico/')({ component: () => <a href="/opengame-detect.sh">Descargar detector</a> })
