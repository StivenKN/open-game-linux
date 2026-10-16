import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { Schema } from 'effect'
import { useEffect, useRef, useState } from 'react'
import { OperatingSystem, VulkanSupport } from '../../domain/evaluation.ts'
import type { InvalidPayload } from '../../domain/errors.ts'
import { evaluarDiagnosticoFn, misEquiposFn, origenFn } from '../../fns/diagnostic.ts'
import { CajaCopiar } from '../../ui/compatibility/CopyBox.tsx'
import { ErrorCampo } from '../../ui/FieldError.tsx'
import { memoria, momento } from '../../ui/format.ts'
import { campo } from '../../ui/form.tsx'
import { type Errores, useAccion } from '../../ui/useAction.ts'
import { motivoPayload, sistema as etiquetaSistema, soporteVulkan } from '../../ui/vocabulary.ts'
import { type Entrada, entradaManual, FormularioManual, guardarPendiente, Pegado } from './-input.ts'

export const Route = createFileRoute('/diagnostico/')({
  validateSearch: Schema.toStandardSchemaV1(Schema.Struct({ pegar: Schema.optionalKey(Schema.Literal(1)) })),
  head: () => ({ meta: [{ title: 'Diagnóstico · OpenGame Linux' }] }),
  loader: async () => {
    const [origen, equipos] = await Promise.all([origenFn(), misEquiposFn()])
    return { origen, equipos }
  },
  component: Diagnostico,
})

function Diagnostico() {
  const { origen, equipos } = Route.useLoaderData()
  return (
    <main className="envoltura pila">
      <h1>Diagnóstico de tu equipo</h1>
      <p className="tenue">
        Compara la RAM, la VRAM y el soporte de Vulkan de tu computador con los perfiles aprobados de cada juego. Puedes
        hacerlo sin cuenta: no guardamos nada hasta que pulses «Guardar en mi equipo».
      </p>
      <div className="rejilla-2">
        <Detector origen={origen} />
        <Manual />
      </div>
      {equipos.length > 0 && (
        <section className="pila" aria-labelledby="mis-equipos">
          <h2 id="mis-equipos" className="titulo-seccion">
            Tus equipos
          </h2>
          {equipos.map((e) => (
            <div key={e.id} className="tarjeta pila">
              <h3 className="sin-margen">{e.alias}</h3>
              {e.diagnosticos.length === 0 ? (
                <p className="pequeno tenue">Sin diagnósticos todavía.</p>
              ) : (
                <ul className="pila">
                  {e.diagnosticos.map((d) => (
                    <li key={d.id}>
                      <Link to="/diagnosticos/$diagnosticoId" params={{ diagnosticoId: d.id }}>
                        {momento(d.capturado_en)}
                      </Link>{' '}
                      <span className="pequeno tenue dato">
                        {d.distribucion ?? etiquetaSistema[d.sistema]} · {d.gpu_modelo} · {memoria(d.ram_mb)} RAM
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </section>
      )}
    </main>
  )
}

const useEvaluar = () => {
  const navegar = useNavigate()
  return async (entrada: Entrada) => {
    const r = await evaluarDiagnosticoFn({ data: entrada })
    if (r.ok) {
      guardarPendiente(entrada)
      await navegar({ to: '/diagnostico/importar' })
    }
    return r
  }
}

const erroresDePayload =
  (campo: string) =>
  (f: typeof InvalidPayload.Encoded): Errores => ({
    [campo]: f.reason === 'campo_invalido' && f.field !== null ? `${motivoPayload.campo_invalido} (${f.field})` : motivoPayload[f.reason],
  })

function Detector({ origen }: { origen: string }) {
  const { pegar } = Route.useSearch()
  const pegado = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    if (pegar === undefined) return
    pegado.current?.focus()
    pegado.current?.scrollIntoView({ block: 'center' })
  }, [pegar])
  const evaluar = useEvaluar()
  const r = useAccion(Pegado, ({ data }) => evaluar({ _tag: 'detector', texto: data.texto }), {
    alFallar: erroresDePayload('texto'),
    alCompletar: () => undefined,
  })
  return (
    <section className="tarjeta pila" aria-labelledby="detector">
      <h2 id="detector" className="sin-margen">
        Detector automático
      </h2>
      <p className="pequeno tenue">
        Un script que lee tu hardware y los juegos que tienes instalados en Steam, sin permisos de administrador. Al terminar
        abre esta página con el resultado en la dirección (después de «#»), que tu navegador no envía a ningún servidor.
      </p>
      <CajaCopiar etiqueta="Ejecuta en PowerShell (Windows 10 u 11, sin administrador)" texto={`irm ${origen}/opengame-detect.ps1 | iex`} />
      <p className="pequeno">
        <a href="/opengame-detect.ps1" download="opengame-detect.ps1">
          Descargar opengame-detect.ps1
        </a>{' '}
        <span className="tenue">para leerlo antes de ejecutarlo con</span> <code>powershell -ExecutionPolicy Bypass -File .\opengame-detect.ps1</code>
      </p>
      <CajaCopiar etiqueta="Ejecuta en una terminal de Linux" texto={`curl -fsSL ${origen}/opengame-detect.sh | bash -s -- --open`} />
      <p className="pequeno">
        <a href="/opengame-detect.sh" download="opengame-detect.sh">
          Descargar opengame-detect.sh
        </a>{' '}
        <span className="tenue">para leerlo antes de ejecutarlo con</span> <code>bash opengame-detect.sh --open</code>
      </p>
      <form className="formulario" {...r.formulario}>
        <label htmlFor="texto">¿Sin navegador en ese equipo? Pega aquí lo que imprimió el detector</label>
        {pegar !== undefined && (
          <p className="pequeno nota" data-tono="verde">
            El detector copió el resultado al portapapeles: pégalo aquí (Ctrl+V)
          </p>
        )}
        <textarea {...campo(r.errores, 'texto')} ref={pegado} className="campo-codigo" spellCheck={false} placeholder='{"version_esquema":1,…} o la dirección completa con #d=' />
        <ErrorCampo errores={r.errores} campo="texto" />
        <ErrorCampo errores={r.errores} campo="formulario" />
        <button type="submit" disabled={r.enviando}>
          {r.enviando ? 'Evaluando…' : 'Evaluar lo pegado'}
        </button>
      </form>
      <p className="pequeno tenue">
        En Linux, ¿Vulkan aparece como «Desconocido»? Instala <code>vulkan-tools</code> y vuelve a ejecutar el detector, o compruébalo a
        mano:
      </p>
      <CajaCopiar etiqueta="Comprobación manual de Vulkan" texto={`vulkaninfo --summary | grep -E "driverName|apiVersion|deviceName"`} />
    </section>
  )
}

const esSistema = Schema.is(OperatingSystem)
const esSoporte = Schema.is(VulkanSupport)

const ramGb = [2, 3, 4, 6, 8, 12, 16, 24, 32, 64]
const vramMb = [512, 1024, 2048, 3072, 4096, 6144, 8192, 12288, 16384]
const versionesVulkan = ['1.0', '1.1', '1.2', '1.3', '1.4']

function Manual() {
  const evaluar = useEvaluar()
  const [so, setSo] = useState<OperatingSystem>('Windows')
  const [vulkan, setVulkan] = useState<VulkanSupport>('desconocido')
  const r = useAccion(FormularioManual, ({ data }) => evaluar(entradaManual(data)), {
    alFallar: erroresDePayload('formulario'),
    alCompletar: () => undefined,
  })
  return (
    <section className="tarjeta pila" aria-labelledby="manual">
      <h2 id="manual" className="sin-margen">
        Descripción manual
      </h2>
      <p className="pequeno tenue">¿No puedes ejecutar el detector? Escribe lo que sabes de tu equipo.</p>
      <form className="formulario" {...r.formulario}>
        <ErrorCampo errores={r.errores} campo="formulario" />
        <div className="campos-2">
          <div>
            <label htmlFor="sistema">Sistema</label>
            <select {...campo(r.errores, 'sistema')} value={so} onChange={(e) => esSistema(e.currentTarget.value) && setSo(e.currentTarget.value)}>
              {OperatingSystem.literals.map((s) => (
                <option key={s} value={s}>
                  {etiquetaSistema[s]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="version_sistema">Versión</label>
            <input {...campo(r.errores, 'version_sistema')} placeholder={so === 'Windows' ? 'Windows 11' : 'Kernel, p. ej. 6.8'} defaultValue={so === 'Windows' ? 'Windows 11' : ''} key={so} />
            <ErrorCampo errores={r.errores} campo="version_sistema" />
          </div>
        </div>
        {so === 'Linux' && (
          <div className="campos-2">
            <div>
              <label htmlFor="distribucion[nombre]">Distribución</label>
              <input {...campo(r.errores, 'distribucion[nombre]')} placeholder="Linux Mint" />
              <ErrorCampo errores={r.errores} campo="distribucion[nombre]" />
            </div>
            <div>
              <label htmlFor="distribucion[version]">Versión de la distribución</label>
              <input {...campo(r.errores, 'distribucion[version]')} placeholder="21.3 o rolling" />
              <ErrorCampo errores={r.errores} campo="distribucion[version]" />
            </div>
          </div>
        )}
        <label htmlFor="cpu_modelo">Procesador (CPU)</label>
        <input {...campo(r.errores, 'cpu_modelo')} placeholder="Intel Core i5-4590" />
        <ErrorCampo errores={r.errores} campo="cpu_modelo" />
        <label htmlFor="gpu_modelo">Tarjeta gráfica (GPU)</label>
        <input {...campo(r.errores, 'gpu_modelo')} placeholder="NVIDIA GeForce GTX 1050" />
        <ErrorCampo errores={r.errores} campo="gpu_modelo" />
        <div className="campos-2">
          <div>
            <label htmlFor="ram_mb">Memoria RAM</label>
            <select {...campo(r.errores, 'ram_mb')} defaultValue="8192">
              {ramGb.map((gb) => (
                <option key={gb} value={gb * 1024}>
                  {gb} GB
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="vram_mb">Memoria de video (VRAM)</label>
            <select {...campo(r.errores, 'vram_mb')} defaultValue="null">
              <option value="null">No sé</option>
              {vramMb.map((mb) => (
                <option key={mb} value={mb}>
                  {memoria(mb)}
                </option>
              ))}
            </select>
          </div>
        </div>
        {so === 'Linux' && (
          <div className="campos-2">
            <div>
              <label htmlFor="soporte_vulkan">Vulkan</label>
              <select {...campo(r.errores, 'soporte_vulkan')} value={vulkan} onChange={(e) => esSoporte(e.currentTarget.value) && setVulkan(e.currentTarget.value)}>
                <option value="desconocido">No sé</option>
                <option value="si">{soporteVulkan.si}</option>
                <option value="no">{soporteVulkan.no}</option>
              </select>
            </div>
            <div>
              <label htmlFor="version_vulkan">Versión de Vulkan</label>
              {vulkan === 'si' ? (
                <select {...campo(r.errores, 'version_vulkan')} defaultValue="null">
                  <option value="null">No sé</option>
                  {versionesVulkan.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              ) : (
                <>
                  <input id="version_vulkan" disabled value="Solo con soporte" />
                  <input type="hidden" name="version_vulkan" value="null" />
                </>
              )}
            </div>
          </div>
        )}
        <label htmlFor="arquitectura">Arquitectura</label>
        <select {...campo(r.errores, 'arquitectura')} defaultValue="x86_64">
          <option value="x86_64">x86_64 (Intel o AMD)</option>
          <option value="aarch64">aarch64 (ARM)</option>
        </select>
        <button type="submit" disabled={r.enviando}>
          {r.enviando ? 'Evaluando…' : 'Evaluar mi equipo'}
        </button>
      </form>
    </section>
  )
}
