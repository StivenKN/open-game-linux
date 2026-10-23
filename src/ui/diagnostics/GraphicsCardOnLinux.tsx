import { vulkanRangeText, type MachineVulkan } from '../../domain/evaluation.ts'
import type { MachineOnLinux, PciId } from '../../domain/gpu.ts'
import { CopyBox } from '../compatibility/CopyBox.tsx'
import type { Messages } from '../i18n/es.ts'
import { useT } from '../i18n/messages.ts'

const vulkanText = (t: Messages, vulkan: MachineVulkan): string => {
  if (vulkan.support === 'desconocido') return t.vulkanSupport.desconocido
  const g = t.diagnosis.graphicsCard
  const value = vulkan.support === 'no' ? g.vulkanNo : vulkan.range === null ? g.vulkanYes : vulkanRangeText(vulkan.range)
  return `${t.vulkanOrigin[vulkan.origin]}: ${value}`
}

export function GraphicsCardOnLinux({ machine, pci }: { machine: MachineOnLinux; pci: PciId | null }) {
  const t = useT()
  const g = t.diagnosis.graphicsCard
  const { gpu, paths, vulkan } = machine
  const option = paths === null ? null : t.d3dPath[paths.d3d9_11].option
  return (
    <section className="machine-panel" aria-label={g.heading}>
      <p className="panel-title">{g.heading}</p>
      {gpu === null && <p className="small muted">{pci === null ? g.noPci : g.unknownGpu(pci)}</p>}
      <dl className="mosaic">
        {gpu !== null && (
          <>
            <div>
              <dt className="caption">{g.generation}</dt>
              <dd>
                <strong>{t.gpuFamily[gpu.family]}</strong>
              </dd>
            </div>
            <div>
              <dt className="caption">{g.driver}</dt>
              <dd>
                <strong>{t.linuxDriver[gpu.driver]}</strong>
              </dd>
            </div>
          </>
        )}
        <div>
          <dt className="caption">Vulkan</dt>
          <dd>
            <strong>{vulkanText(t, vulkan)}</strong>
          </dd>
        </div>
        {paths !== null && (
          <>
            <div>
              <dt className="caption">{g.d3d9to11}</dt>
              <dd>
                <strong>{t.d3dPath[paths.d3d9_11].text}</strong>
                {t.d3dPath[paths.d3d9_11].detail && <span className="small muted">{t.d3dPath[paths.d3d9_11].detail}</span>}
              </dd>
            </div>
            <div>
              <dt className="caption">DirectX 12</dt>
              <dd>
                <strong>{paths.d3d12 ? g.d3d12Yes : g.d3d12No}</strong>
                {!paths.d3d12 && <span className="small muted">{g.d3d12Needs}</span>}
              </dd>
            </div>
          </>
        )}
      </dl>
      {option !== null && <CopyBox label={g.launchOption} text={option} />}
      {gpu !== null &&
        gpu.warnings.map((a) => (
          <p key={a} className="small note" data-tone="amarillo">
            {t.gpuWarning[a]}
          </p>
        ))}
      {vulkan.support !== 'desconocido' && vulkan.origin === 'proyectado' && <p className="small muted">{g.projected}</p>}
    </section>
  )
}
