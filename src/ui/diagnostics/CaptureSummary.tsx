import { Link } from '@tanstack/react-router'
import type { Capture } from '../../domain/contributions.ts'
import { memory } from '../format.ts'
import type { Messages } from '../i18n/es.ts'
import { useLang, useT } from '../i18n/messages.ts'
import { device, operatingSystem } from '../vocabulary.ts'

const swapLine = (t: Messages, name: string, mb: number | null) =>
  mb === null ? [] : [mb === 0 ? t.diagnosis.capture.noSwap(name) : `${name} ${t.approximateMemory(mb)}`]

export function CaptureSummary({ capture }: { capture: Capture }) {
  const t = useT()
  const lang = useLang()
  const c = t.diagnosis.capture
  const rows = [
    ...(capture.device === null ? [] : ([[c.device, device[capture.device], null]] as const)),
    [c.system, capture.operating_system === 'Linux' ? `${capture.distribution.name} ${capture.distribution.version}` : operatingSystem.Windows, `${capture.os_version} · ${capture.architecture}`],
    [c.cpu, capture.cpu_model, capture.x86_level === null ? c.noX86Level : `x86-64-${capture.x86_level}`],
    [c.gpu, capture.gpu_model, capture.vram_mb === null ? c.unknownVram : c.vram(memory(capture.vram_mb))],
    [c.ram, memory(capture.ram_mb), [...swapLine(t, 'zram', capture.zram_mb), ...swapLine(t, 'swap', capture.swap_mb)].join(' · ') || null],
    ...(capture.operating_system === 'Linux'
      ? ([
          ['Vulkan', capture.vulkan_support === 'si' && capture.vulkan_version !== null ? `Vulkan ${capture.vulkan_version}` : t.vulkanSupport[capture.vulkan_support], null],
          [c.driver, capture.driver ?? c.unknownDriver, capture.driver_version],
        ] as const)
      : []),
    // Shown, not judged: no verdict rests on Secure Boot or the TPM yet.
    [c.secureBoot, capture.secure_boot === null ? c.notCaptured : t.secureBoot[capture.secure_boot], capture.tpm === null ? c.tpmNotCaptured : t.tpm[capture.tpm]],
  ] as const
  return (
    <section className="stack" aria-label={c.label}>
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
      <p className="small muted">{c.captured(t.dateTime(capture.captured_at))}</p>
      <p className="small">
        {c.guides(
          <Link to="/$lang/guias" params={{ lang }}>
            {c.guidesLink}
          </Link>,
        )}
      </p>
    </section>
  )
}
