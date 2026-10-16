import { vulkanRangeText, type MachineVulkan } from '../../domain/evaluation.ts'
import type { MachineOnLinux, PciId } from '../../domain/gpu.ts'
import { CopyBox } from '../compatibility/CopyBox.tsx'
import { gpuWarning, linuxDriver, gpuFamily, vulkanOrigin, d3dPath } from '../vocabulary.ts'

const vulkanText = (vulkan: MachineVulkan): string => {
  if (vulkan.support === 'desconocido') return 'Desconocido'
  const value = vulkan.support === 'no' ? 'sin soporte' : vulkan.range === null ? 'compatible' : vulkanRangeText(vulkan.range)
  return `${vulkanOrigin[vulkan.origin]}: ${value}`
}

export function GraphicsCardOnLinux({ machine, pci }: { machine: MachineOnLinux; pci: PciId | null }) {
  const { gpu, paths, vulkan } = machine
  const option = paths === null ? null : d3dPath[paths.d3d9_11].option
  return (
    <section className="machine-panel" aria-label="Tu tarjeta gráfica en Linux">
      <p className="panel-title">Tu tarjeta gráfica en Linux</p>
      {gpu === null && (
        <p className="small muted">
          {pci === null
            ? 'Este diagnóstico no trae el identificador PCI de tu tarjeta gráfica. Vuelve a ejecutar el detector para ver qué podrá hacer en Linux.'
            : `No reconocemos la tarjeta gráfica ${pci}, así que no podemos proyectar qué hará en Linux.`}
        </p>
      )}
      <dl className="mosaic">
        {gpu !== null && (
          <>
            <div>
              <dt className="caption">Generación</dt>
              <dd>
                <strong>{gpuFamily[gpu.family]}</strong>
              </dd>
            </div>
            <div>
              <dt className="caption">Controlador en Linux</dt>
              <dd>
                <strong>{linuxDriver[gpu.driver]}</strong>
              </dd>
            </div>
          </>
        )}
        <div>
          <dt className="caption">Vulkan</dt>
          <dd>
            <strong>{vulkanText(vulkan)}</strong>
          </dd>
        </div>
        {paths !== null && (
          <>
            <div>
              <dt className="caption">DirectX 9 a 11</dt>
              <dd>
                <strong>{d3dPath[paths.d3d9_11].text}</strong>
                {d3dPath[paths.d3d9_11].detail && <span className="small muted">{d3dPath[paths.d3d9_11].detail}</span>}
              </dd>
            </div>
            <div>
              <dt className="caption">DirectX 12</dt>
              <dd>
                <strong>{paths.d3d12 ? 'Sí, con VKD3D-Proton' : 'No'}</strong>
                {!paths.d3d12 && <span className="small muted">Necesita Vulkan 1.3</span>}
              </dd>
            </div>
          </>
        )}
      </dl>
      {option !== null && <CopyBox label="Opción de lanzamiento en Steam" text={option} />}
      {gpu !== null &&
        gpu.warnings.map((a) => (
          <p key={a} className="small note" data-tone="amarillo">
            {gpuWarning[a]}
          </p>
        ))}
      {vulkan.support !== 'desconocido' && vulkan.origin === 'proyectado' && (
        <p className="small muted">Proyección a partir del modelo de tu GPU, no una medición.</p>
      )}
    </section>
  )
}
