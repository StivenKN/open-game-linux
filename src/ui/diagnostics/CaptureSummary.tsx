import { Link } from '@tanstack/react-router'
import type { Capture } from '../../domain/contributions.ts'
import { memoria, memoriaAproximada, momento } from '../format.ts'
import { arranqueSeguro, sistema, soporteVulkan, tpm } from '../vocabulary.ts'

const intercambio = (nombre: string, mb: number | null) => (mb === null ? [] : [mb === 0 ? `sin ${nombre}` : `${nombre} ${memoriaAproximada(mb)}`])

export function ResumenCaptura({ captura }: { captura: Capture }) {
  const datos = [
    ['Sistema', captura.sistema === 'Linux' ? `${captura.distribucion.nombre} ${captura.distribucion.version}` : sistema.Windows, `${captura.version_sistema} · ${captura.arquitectura}`],
    ['Procesador', captura.cpu_modelo, captura.nivel_x86 === null ? 'Nivel x86-64 no capturado' : `x86-64-${captura.nivel_x86}`],
    ['Tarjeta gráfica', captura.gpu_modelo, captura.vram_mb === null ? 'VRAM desconocida' : `${memoria(captura.vram_mb)} de VRAM`],
    ['Memoria RAM', memoria(captura.ram_mb), [...intercambio('zram', captura.zram_mb), ...intercambio('swap', captura.swap_mb)].join(' · ') || null],
    ...(captura.sistema === 'Linux'
      ? ([
          ['Vulkan', captura.soporte_vulkan === 'si' && captura.version_vulkan !== null ? `Vulkan ${captura.version_vulkan}` : soporteVulkan[captura.soporte_vulkan], null],
          ['Controlador', captura.controlador ?? 'Desconocido', captura.version_controlador],
        ] as const)
      : []),
    // Shown, not judged: no verdict rests on Secure Boot or the TPM yet.
    [
      'Arranque seguro',
      captura.arranque_seguro === null ? 'No capturado' : arranqueSeguro[captura.arranque_seguro],
      captura.tpm === null ? 'TPM no capturado' : tpm[captura.tpm],
    ],
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
