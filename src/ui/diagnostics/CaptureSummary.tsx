import { Link } from '@tanstack/react-router'
import type { Capture } from '../../domain/contributions.ts'
import { memory, approximateMemory, dateTime } from '../format.ts'
import { device, secureBoot, operatingSystem, vulkanSupport, tpm } from '../vocabulary.ts'

const swapLine = (name: string, mb: number | null) => (mb === null ? [] : [mb === 0 ? `sin ${name}` : `${name} ${approximateMemory(mb)}`])

export function CaptureSummary({ capture }: { capture: Capture }) {
  const rows = [
    ...(capture.device === null ? [] : ([['Equipo', device[capture.device], null]] as const)),
    ['Sistema', capture.operating_system === 'Linux' ? `${capture.distribution.name} ${capture.distribution.version}` : operatingSystem.Windows, `${capture.os_version} · ${capture.architecture}`],
    ['Procesador', capture.cpu_model, capture.x86_level === null ? 'Nivel x86-64 no capturado' : `x86-64-${capture.x86_level}`],
    ['Tarjeta gráfica', capture.gpu_model, capture.vram_mb === null ? 'VRAM desconocida' : `${memory(capture.vram_mb)} de VRAM`],
    ['Memoria RAM', memory(capture.ram_mb), [...swapLine('zram', capture.zram_mb), ...swapLine('swap', capture.swap_mb)].join(' · ') || null],
    ...(capture.operating_system === 'Linux'
      ? ([
          ['Vulkan', capture.vulkan_support === 'si' && capture.vulkan_version !== null ? `Vulkan ${capture.vulkan_version}` : vulkanSupport[capture.vulkan_support], null],
          ['Controlador', capture.driver ?? 'Desconocido', capture.driver_version],
        ] as const)
      : []),
    // Shown, not judged: no verdict rests on Secure Boot or the TPM yet.
    [
      'Arranque seguro',
      capture.secure_boot === null ? 'No capturado' : secureBoot[capture.secure_boot],
      capture.tpm === null ? 'TPM no capturado' : tpm[capture.tpm],
    ],
  ] as const
  return (
    <section className="stack" aria-label="Tu equipo">
      <dl className="mosaic">
        {rows.map(([caption, value, detail]) => (
          <div key={caption} className="card">
            <dt className="caption">{caption}</dt>
            <dd>
              <strong>{value}</strong>
              {detail && <span className="small muted datum">{detail}</span>}
            </dd>
          </div>
        ))}
      </dl>
      <p className="small muted">Capturado el {dateTime(capture.captured_at)}.</p>
      <p className="small">
        Para elegir una distribución, instalarla o hacer arranque dual con Windows, consulta las <Link to="/guias">guías de adopción</Link>.
      </p>
    </section>
  )
}
