import { Link } from '@tanstack/react-router'
import type { Capture } from '../../domain/contributions.ts'
import { memory, approximateMemory, dateTime } from '../format.ts'
import { secureBoot, operatingSystem, vulkanSupport, tpm } from '../vocabulary.ts'

const swapLine = (name: string, mb: number | null) => (mb === null ? [] : [mb === 0 ? `sin ${name}` : `${name} ${approximateMemory(mb)}`])

export function CaptureSummary({ capture }: { capture: Capture }) {
  const rows = [
    ['Sistema', capture.sistema === 'Linux' ? `${capture.distribucion.nombre} ${capture.distribucion.version}` : operatingSystem.Windows, `${capture.version_sistema} · ${capture.arquitectura}`],
    ['Procesador', capture.cpu_modelo, capture.nivel_x86 === null ? 'Nivel x86-64 no capturado' : `x86-64-${capture.nivel_x86}`],
    ['Tarjeta gráfica', capture.gpu_modelo, capture.vram_mb === null ? 'VRAM desconocida' : `${memory(capture.vram_mb)} de VRAM`],
    ['Memoria RAM', memory(capture.ram_mb), [...swapLine('zram', capture.zram_mb), ...swapLine('swap', capture.swap_mb)].join(' · ') || null],
    ...(capture.sistema === 'Linux'
      ? ([
          ['Vulkan', capture.soporte_vulkan === 'si' && capture.version_vulkan !== null ? `Vulkan ${capture.version_vulkan}` : vulkanSupport[capture.soporte_vulkan], null],
          ['Controlador', capture.controlador ?? 'Desconocido', capture.version_controlador],
        ] as const)
      : []),
    // Shown, not judged: no verdict rests on Secure Boot or the TPM yet.
    [
      'Arranque seguro',
      capture.arranque_seguro === null ? 'No capturado' : secureBoot[capture.arranque_seguro],
      capture.tpm === null ? 'TPM no capturado' : tpm[capture.tpm],
    ],
  ] as const
  return (
    <section className="pila" aria-label="Tu equipo">
      <dl className="mosaico">
        {rows.map(([caption, value, detail]) => (
          <div key={caption} className="tarjeta">
            <dt className="rotulo">{caption}</dt>
            <dd>
              <strong>{value}</strong>
              {detail && <span className="pequeno tenue dato">{detail}</span>}
            </dd>
          </div>
        ))}
      </dl>
      <p className="pequeno tenue">Capturado el {dateTime(capture.capturado_en)}.</p>
      <p className="pequeno">
        Para elegir una distribución, instalarla o hacer arranque dual con Windows, consulta las <Link to="/guias">guías de adopción</Link>.
      </p>
    </section>
  )
}
