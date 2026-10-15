import { rangoVulkan, type VulkanEquipo } from '../../dominio/evaluacion.ts'
import type { EquipoEnLinux, PciId } from '../../dominio/gpu.ts'
import { CajaCopiar } from '../compatibilidad/CajaCopiar.tsx'
import { avisoGpu, controladorLinux, familiaGpu, origenVulkan, rutaD3d } from '../vocabulario.ts'

const vulkanTexto = (vulkan: VulkanEquipo): string => {
  if (vulkan.soporte === 'desconocido') return 'Desconocido'
  const valor = vulkan.soporte === 'no' ? 'sin soporte' : vulkan.origen === 'medido' ? (vulkan.version?.texto ?? 'compatible') : rangoVulkan(vulkan)
  return `${origenVulkan[vulkan.origen]}: ${valor}`
}

/** What the server projected for this GPU on Linux (servidor/gpu/capacidad.ts), dashed like every hardware-derived panel. */
export function TarjetaGraficaEnLinux({ equipo, pci }: { equipo: EquipoEnLinux; pci: PciId | null }) {
  const { gpu, ruta, vulkan } = equipo
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
                <strong>{familiaGpu[gpu.familia]}</strong>
              </dd>
            </div>
            <div>
              <dt className="rotulo">Controlador en Linux</dt>
              <dd>
                <strong>{controladorLinux[gpu.controlador]}</strong>
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
        gpu.avisos.map((a) => (
          <p key={a} className="pequeno nota" data-tono="amarillo">
            {avisoGpu[a]}
          </p>
        ))}
      {vulkan.soporte !== 'desconocido' && vulkan.origen === 'proyectado' && (
        <p className="pequeno tenue">Proyección a partir del modelo de tu GPU, no una medición.</p>
      )}
    </section>
  )
}
