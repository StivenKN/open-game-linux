import { Link } from '@tanstack/react-router'
import type { Captura } from '../../dominio/aportes.ts'
import { memoria, momento } from '../formato.ts'
import { sistema, soporteVulkan } from '../vocabulario.ts'

export function ResumenCaptura({ captura }: { captura: Captura }) {
  const vulkan =
    captura.soporte_vulkan === 'si' && captura.version_vulkan !== null
      ? `Vulkan ${captura.version_vulkan}`
      : soporteVulkan[captura.soporte_vulkan]
  const datos = [
    ['Sistema', captura.sistema === 'Linux' ? `${captura.distribucion.nombre} ${captura.distribucion.version}` : sistema.Windows, `${captura.version_sistema} · ${captura.arquitectura}`],
    ['Procesador', captura.cpu_modelo, null],
    ['Tarjeta gráfica', captura.gpu_modelo, captura.vram_mb === null ? 'VRAM desconocida' : `${memoria(captura.vram_mb)} de VRAM`],
    ['Memoria RAM', memoria(captura.ram_mb), null],
    ['Vulkan', vulkan, null],
    ['Controlador', captura.controlador ?? 'Desconocido', captura.version_controlador],
  ] as const
  return (
    <section className="pila" aria-label="Tu equipo">
      <dl className="mosaico">
        {datos.map(([rotulo, valor, detalle]) => (
          <div key={rotulo} className="tarjeta">
            <dt className="rotulo">{rotulo}</dt>
            <dd>
              <strong>{valor}</strong>
              {detalle && <span className="pequeno tenue dato">{detalle}</span>}
            </dd>
          </div>
        ))}
      </dl>
      <p className="pequeno tenue">Capturado el {momento(captura.capturado_en)}.</p>
      <p className="pequeno">
        Para elegir una distribución, instalarla o hacer arranque dual con Windows, consulta las <Link to="/guias">guías de adopción</Link>.
      </p>
    </section>
  )
}
