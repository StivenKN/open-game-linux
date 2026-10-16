import { vulkanRangeText, type MachineVulkan } from '../../domain/evaluation.ts'
import type { MachineOnLinux, PciId } from '../../domain/gpu.ts'
import { CajaCopiar } from '../compatibility/CopyBox.tsx'
import { avisoGpu, controladorLinux, familiaGpu, origenVulkan, rutaD3d } from '../vocabulary.ts'

const vulkanTexto = (vulkan: MachineVulkan): string => {
  if (vulkan.support === 'desconocido') return 'Desconocido'
  const valor = vulkan.support === 'no' ? 'sin soporte' : vulkan.range === null ? 'compatible' : vulkanRangeText(vulkan.range)
  return `${origenVulkan[vulkan.origin]}: ${valor}`
}

export function TarjetaGraficaEnLinux({ equipo, pci }: { equipo: MachineOnLinux; pci: PciId | null }) {
  const { gpu, paths: ruta, vulkan } = equipo
  const opcion = ruta === null ? null : rutaD3d[ruta.d3d9_11].opcion
  return (
    <section className="panel-equipo" aria-label="Tu tarjeta gráfica en Linux">
      <p className="panel-titulo">Tu tarjeta gráfica en Linux</p>
      {gpu === null && (
        <p className="pequeno tenue">
          {pci === null
            ? 'Este diagnóstico no trae el identificador PCI de tu tarjeta gráfica. Vuelve a ejecutar el detector para ver qué podrá hacer en Linux.'
            : `No reconocemos la tarjeta gráfica ${pci}, así que no podemos proyectar qué hará en Linux.`}
        </p>
      )}
      <dl className="mosaico">
        {gpu !== null && (
          <>
            <div>
              <dt className="rotulo">Generación</dt>
              <dd>
                <strong>{familiaGpu[gpu.family]}</strong>
              </dd>
            </div>
            <div>
              <dt className="rotulo">Controlador en Linux</dt>
              <dd>
                <strong>{controladorLinux[gpu.driver]}</strong>
              </dd>
            </div>
          </>
        )}
        <div>
          <dt className="rotulo">Vulkan</dt>
          <dd>
            <strong>{vulkanTexto(vulkan)}</strong>
          </dd>
        </div>
        {ruta !== null && (
          <>
            <div>
              <dt className="rotulo">DirectX 9 a 11</dt>
              <dd>
                <strong>{rutaD3d[ruta.d3d9_11].texto}</strong>
                {rutaD3d[ruta.d3d9_11].detalle && <span className="pequeno tenue">{rutaD3d[ruta.d3d9_11].detalle}</span>}
              </dd>
            </div>
            <div>
              <dt className="rotulo">DirectX 12</dt>
              <dd>
                <strong>{ruta.d3d12 ? 'Sí, con VKD3D-Proton' : 'No'}</strong>
                {!ruta.d3d12 && <span className="pequeno tenue">Necesita Vulkan 1.3</span>}
              </dd>
            </div>
          </>
        )}
      </dl>
      {opcion !== null && <CajaCopiar etiqueta="Opción de lanzamiento en Steam" texto={opcion} />}
      {gpu !== null &&
        gpu.warnings.map((a) => (
          <p key={a} className="pequeno nota" data-tono="amarillo">
            {avisoGpu[a]}
          </p>
        ))}
      {vulkan.support !== 'desconocido' && vulkan.origin === 'proyectado' && (
        <p className="pequeno tenue">Proyección a partir del modelo de tu GPU, no una medición.</p>
      )}
    </section>
  )
}
