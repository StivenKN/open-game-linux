import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { Schema } from 'effect'
import { useEffect, useRef, useState } from 'react'
import { OperatingSystem, VulkanSupport } from '../../domain/evaluation.ts'
import type { InvalidPayload } from '../../domain/errors.ts'
import { evaluateDiagnosticFn, myMachinesFn, originFn } from '../../fns/diagnostic.ts'
import { CopyBox } from '../../ui/compatibility/CopyBox.tsx'
import { FieldError } from '../../ui/FieldError.tsx'
import { memory, dateTime } from '../../ui/format.ts'
import { fieldProps } from '../../ui/form.tsx'
import { type FieldErrors, useAction } from '../../ui/useAction.ts'
import { payloadReason, operatingSystem as operatingSystemLabel, vulkanSupport } from '../../ui/vocabulary.ts'
import { type Input, manualInput, ManualForm, savePending, Pasted } from './-input.ts'

export const Route = createFileRoute('/diagnostico/')({
  validateSearch: Schema.toStandardSchemaV1(Schema.Struct({ pegar: Schema.optionalKey(Schema.Literal(1)) })),
  head: () => ({ meta: [{ title: 'Diagnóstico · OpenGame Linux' }] }),
  loader: async () => {
    const [siteOrigin, machines] = await Promise.all([originFn(), myMachinesFn()])
    return { siteOrigin, machines }
  },
  component: DiagnosticPage,
})

function DiagnosticPage() {
  const { siteOrigin, machines } = Route.useLoaderData()
  return (
    <main className="envoltura pila">
      <h1>Diagnóstico de tu equipo</h1>
      <p className="tenue">
        Compara la RAM, la VRAM y el soporte de Vulkan de tu computador con los perfiles aprobados de cada juego. Puedes
        hacerlo sin cuenta: no guardamos nada hasta que pulses «Guardar en mi equipo».
      </p>
      <div className="rejilla-2">
        <Detector siteOrigin={siteOrigin} />
        <Manual />
      </div>
      {machines.length > 0 && (
        <section className="pila" aria-labelledby="mis-equipos">
          <h2 id="mis-equipos" className="titulo-seccion">
            Tus equipos
          </h2>
          {machines.map((e) => (
            <div key={e.id} className="tarjeta pila">
              <h3 className="sin-margen">{e.alias}</h3>
              {e.diagnostics.length === 0 ? (
                <p className="pequeno tenue">Sin diagnósticos todavía.</p>
              ) : (
                <ul className="pila">
                  {e.diagnostics.map((d) => (
                    <li key={d.id}>
                      <Link to="/diagnosticos/$diagnosticId" params={{ diagnosticId: d.id }}>
                        {dateTime(d.capturado_en)}
                      </Link>{' '}
                      <span className="pequeno tenue dato">
                        {d.distribucion ?? operatingSystemLabel[d.sistema]} · {d.gpu_modelo} · {memory(d.ram_mb)} RAM
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

const useEvaluate = () => {
  const navigate = useNavigate()
  return async (input: Input) => {
    const r = await evaluateDiagnosticFn({ data: input })
    if (r.ok) {
      savePending(input)
      await navigate({ to: '/diagnostico/importar' })
    }
    return r
  }
}

const payloadErrors =
  (field: string) =>
  (f: typeof InvalidPayload.Encoded): FieldErrors => ({
    [field]: f.reason === 'campo_invalido' && f.field !== null ? `${payloadReason.campo_invalido} (${f.field})` : payloadReason[f.reason],
  })

function Detector({ siteOrigin }: { siteOrigin: string }) {
  const { pegar } = Route.useSearch()
  const pasteBox = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    if (pegar === undefined) return
    pasteBox.current?.focus()
    pasteBox.current?.scrollIntoView({ block: 'center' })
  }, [pegar])
  const evaluate = useEvaluate()
  const r = useAction(Pasted, ({ data }) => evaluate({ _tag: 'detector', texto: data.texto }), {
    onFailure: payloadErrors('texto'),
    onComplete: () => undefined,
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
      <CopyBox label="Ejecuta en PowerShell (Windows 10 u 11, sin administrador)" text={`irm ${siteOrigin}/opengame-detect.ps1 | iex`} />
      <p className="pequeno">
        <a href="/opengame-detect.ps1" download="opengame-detect.ps1">
          Descargar opengame-detect.ps1
        </a>{' '}
        <span className="tenue">para leerlo antes de ejecutarlo con</span> <code>powershell -ExecutionPolicy Bypass -File .\opengame-detect.ps1</code>
      </p>
      <CopyBox label="Ejecuta en una terminal de Linux" text={`curl -fsSL ${siteOrigin}/opengame-detect.sh | bash -s -- --open`} />
      <p className="pequeno">
        <a href="/opengame-detect.sh" download="opengame-detect.sh">
          Descargar opengame-detect.sh
        </a>{' '}
        <span className="tenue">para leerlo antes de ejecutarlo con</span> <code>bash opengame-detect.sh --open</code>
      </p>
      <form className="formulario" {...r.form}>
        <label htmlFor="texto">¿Sin navegador en ese equipo? Pega aquí lo que imprimió el detector</label>
        {pegar !== undefined && (
          <p className="pequeno nota" data-tono="verde">
            El detector copió el resultado al portapapeles: pégalo aquí (Ctrl+V)
          </p>
        )}
        <textarea {...fieldProps(r.errors, 'texto')} ref={pasteBox} className="campo-codigo" spellCheck={false} placeholder='{"version_esquema":1,…} o la dirección completa con #d=' />
        <FieldError errors={r.errors} field="texto" />
        <FieldError errors={r.errors} field="formulario" />
        <button type="submit" disabled={r.submitting}>
          {r.submitting ? 'Evaluando…' : 'Evaluar lo pegado'}
        </button>
      </form>
      <p className="pequeno tenue">
        En Linux, ¿Vulkan aparece como «Desconocido»? Instala <code>vulkan-tools</code> y vuelve a ejecutar el detector, o compruébalo a
        mano:
      </p>
      <CopyBox label="Comprobación manual de Vulkan" text={`vulkaninfo --summary | grep -E "driverName|apiVersion|deviceName"`} />
    </section>
  )
}

const isOperatingSystem = Schema.is(OperatingSystem)
const isVulkanSupport = Schema.is(VulkanSupport)

const ramGb = [2, 3, 4, 6, 8, 12, 16, 24, 32, 64]
const vramMb = [512, 1024, 2048, 3072, 4096, 6144, 8192, 12288, 16384]
const vulkanVersions = ['1.0', '1.1', '1.2', '1.3', '1.4']

function Manual() {
  const evaluate = useEvaluate()
  const [os, setOs] = useState<OperatingSystem>('Windows')
  const [vulkan, setVulkan] = useState<VulkanSupport>('desconocido')
  const r = useAction(ManualForm, ({ data }) => evaluate(manualInput(data)), {
    onFailure: payloadErrors('formulario'),
    onComplete: () => undefined,
  })
  return (
    <section className="tarjeta pila" aria-labelledby="manual">
      <h2 id="manual" className="sin-margen">
        Descripción manual
      </h2>
      <p className="pequeno tenue">¿No puedes ejecutar el detector? Escribe lo que sabes de tu equipo.</p>
      <form className="formulario" {...r.form}>
        <FieldError errors={r.errors} field="formulario" />
        <div className="campos-2">
          <div>
            <label htmlFor="sistema">Sistema</label>
            <select {...fieldProps(r.errors, 'sistema')} value={os} onChange={(e) => isOperatingSystem(e.currentTarget.value) && setOs(e.currentTarget.value)}>
              {OperatingSystem.literals.map((s) => (
                <option key={s} value={s}>
                  {operatingSystemLabel[s]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="version_sistema">Versión</label>
            <input {...fieldProps(r.errors, 'version_sistema')} placeholder={os === 'Windows' ? 'Windows 11' : 'Kernel, p. ej. 6.8'} defaultValue={os === 'Windows' ? 'Windows 11' : ''} key={os} />
            <FieldError errors={r.errors} field="version_sistema" />
          </div>
        </div>
        {os === 'Linux' && (
          <div className="campos-2">
            <div>
              <label htmlFor="distribucion[nombre]">Distribución</label>
              <input {...fieldProps(r.errors, 'distribucion[nombre]')} placeholder="Linux Mint" />
              <FieldError errors={r.errors} field="distribucion[nombre]" />
            </div>
            <div>
              <label htmlFor="distribucion[version]">Versión de la distribución</label>
              <input {...fieldProps(r.errors, 'distribucion[version]')} placeholder="21.3 o rolling" />
              <FieldError errors={r.errors} field="distribucion[version]" />
            </div>
          </div>
        )}
        <label htmlFor="cpu_modelo">Procesador (CPU)</label>
        <input {...fieldProps(r.errors, 'cpu_modelo')} placeholder="Intel Core i5-4590" />
        <FieldError errors={r.errors} field="cpu_modelo" />
        <label htmlFor="gpu_modelo">Tarjeta gráfica (GPU)</label>
        <input {...fieldProps(r.errors, 'gpu_modelo')} placeholder="NVIDIA GeForce GTX 1050" />
        <FieldError errors={r.errors} field="gpu_modelo" />
        <div className="campos-2">
          <div>
            <label htmlFor="ram_mb">Memoria RAM</label>
            <select {...fieldProps(r.errors, 'ram_mb')} defaultValue="8192">
              {ramGb.map((gb) => (
                <option key={gb} value={gb * 1024}>
                  {gb} GB
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="vram_mb">Memoria de video (VRAM)</label>
            <select {...fieldProps(r.errors, 'vram_mb')} defaultValue="null">
              <option value="null">No sé</option>
              {vramMb.map((mb) => (
                <option key={mb} value={mb}>
                  {memory(mb)}
                </option>
              ))}
            </select>
          </div>
        </div>
        {os === 'Linux' && (
          <div className="campos-2">
            <div>
              <label htmlFor="soporte_vulkan">Vulkan</label>
              <select {...fieldProps(r.errors, 'soporte_vulkan')} value={vulkan} onChange={(e) => isVulkanSupport(e.currentTarget.value) && setVulkan(e.currentTarget.value)}>
                <option value="desconocido">No sé</option>
                <option value="si">{vulkanSupport.si}</option>
                <option value="no">{vulkanSupport.no}</option>
              </select>
            </div>
            <div>
              <label htmlFor="version_vulkan">Versión de Vulkan</label>
              {vulkan === 'si' ? (
                <select {...fieldProps(r.errors, 'version_vulkan')} defaultValue="null">
                  <option value="null">No sé</option>
                  {vulkanVersions.map((v) => (
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
        <select {...fieldProps(r.errors, 'arquitectura')} defaultValue="x86_64">
          <option value="x86_64">x86_64 (Intel o AMD)</option>
          <option value="aarch64">aarch64 (ARM)</option>
        </select>
        <button type="submit" disabled={r.submitting}>
          {r.submitting ? 'Evaluando…' : 'Evaluar mi equipo'}
        </button>
      </form>
    </section>
  )
}
