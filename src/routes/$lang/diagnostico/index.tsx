import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Schema } from 'effect'
import { useEffect, useRef, useState } from 'react'
import { OperatingSystem, VulkanSupport } from '../../../domain/evaluation.ts'
import { Device } from '../../../domain/platform.ts'
import type { InvalidPayload } from '../../../domain/errors.ts'
import { evaluateDiagnosticFn, myMachinesFn } from '../../../fns/diagnostic.ts'
import { CopyBox } from '../../../ui/compatibility/CopyBox.tsx'
import { FieldError } from '../../../ui/FieldError.tsx'
import { SavedMachines } from '../../../ui/diagnostics/SavedMachines.tsx'
import { memory } from '../../../ui/format.ts'
import { fieldProps, ramGb, vramMb, vulkanVersions } from '../../../ui/form.tsx'
import type { Messages } from '../../../ui/i18n/es.ts'
import { langQuery } from '../../../ui/i18n/lang.ts'
import { useLang, useT } from '../../../ui/i18n/messages.ts'
import { type FieldErrors, useAction } from '../../../ui/useAction.ts'
import { device, operatingSystem as operatingSystemLabel } from '../../../ui/vocabulary.ts'
import { titled } from '../../-head.ts'
import { type Input, manualInput, ManualForm, savePending, Pasted } from './-input.ts'

export const Route = createFileRoute('/$lang/diagnostico/')({
  validateSearch: Schema.toStandardSchemaV1(Schema.Struct({ pegar: Schema.optionalKey(Schema.Literal(1)) })),
  head: ({ params }) => titled(params.lang, (t) => t.diagnosis.title),
  loader: () => myMachinesFn(),
  component: DiagnosticPage,
})

function DiagnosticPage() {
  const machines = Route.useLoaderData()
  const t = useT()
  return (
    <main className="wrapper stack">
      <h1>{t.diagnosis.heading}</h1>
      <p className="muted">{t.diagnosis.intro}</p>
      <div className="grid-2">
        <Detector />
        <Manual />
      </div>
      {machines.length > 0 && (
        <section className="stack" aria-labelledby="my-machines">
          <h2 id="my-machines" className="section-title">
            {t.diagnosis.myMachines}
          </h2>
          <SavedMachines machines={machines} />
        </section>
      )}
    </main>
  )
}

const useEvaluate = () => {
  const navigate = useNavigate()
  const lang = useLang()
  return async (input: Input) => {
    const r = await evaluateDiagnosticFn({ data: input })
    if (r.ok) {
      savePending(input)
      await navigate({ to: '/$lang/diagnostico/importar', params: { lang } })
    }
    return r
  }
}

const payloadErrors =
  (field: string) =>
  (f: typeof InvalidPayload.Encoded, t: Messages): FieldErrors => ({
    [field]: f.reason === 'campo_invalido' && f.field !== null ? `${t.payloadReason.campo_invalido} (${f.field})` : t.payloadReason[f.reason],
  })

function Detector() {
  const { pegar } = Route.useSearch()
  // The site's public address, which the commands below download the detector from.
  const { origin } = Route.useRouteContext()
  const t = useT()
  const lang = useLang()
  const d = t.diagnosis.detector
  // The scripts speak the page's language and open its pages. The commands quote the address, so zsh does not
  // read `?lang=en` as a glob.
  const script = (file: string) => `/${file}${langQuery(lang)}`
  const pasteBox = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    if (pegar === undefined) return
    pasteBox.current?.focus()
    pasteBox.current?.scrollIntoView({ block: 'center' })
  }, [pegar])
  const evaluate = useEvaluate()
  const r = useAction(Pasted, ({ data }) => evaluate({ _tag: 'detector', texto: data.text }), {
    onFailure: payloadErrors('text'),
    onComplete: () => undefined,
  })
  return (
    <section className="card stack" aria-labelledby="detector">
      <h2 id="detector" className="no-margin">
        {d.heading}
      </h2>
      <p className="small muted">{d.intro}</p>
      <CopyBox label={d.powershell} text={`irm '${origin}${script('opengame-detect.ps1')}' | iex`} />
      <p className="small">
        <a href={script('opengame-detect.ps1')} download="opengame-detect.ps1">
          {d.download('opengame-detect.ps1')}
        </a>{' '}
        <span className="muted">{d.readFirst}</span> <code>powershell -ExecutionPolicy Bypass -File .\opengame-detect.ps1</code>
      </p>
      <CopyBox label={d.linux} text={`curl -fsSL '${origin}${script('opengame-detect.sh')}' | bash -s -- --open`} />
      <p className="small">
        <a href={script('opengame-detect.sh')} download="opengame-detect.sh">
          {d.download('opengame-detect.sh')}
        </a>{' '}
        <span className="muted">{d.readFirst}</span> <code>bash opengame-detect.sh --open</code>
      </p>
      <form className="form" {...r.form}>
        <label htmlFor="text">{d.pasteLabel}</label>
        {pegar !== undefined && (
          <p className="small note" data-tone="verde">
            {d.copied}
          </p>
        )}
        <textarea {...fieldProps(r.errors, 'text')} ref={pasteBox} className="code-field" spellCheck={false} placeholder={d.pastePlaceholder} />
        <FieldError errors={r.errors} field="text" />
        <FieldError errors={r.errors} field="form" />
        <button type="submit" disabled={r.submitting}>
          {r.submitting ? t.diagnosis.evaluating : d.evaluate}
        </button>
      </form>
      <p className="small muted">{d.vulkanUnknown}</p>
      <CopyBox label={d.vulkanCheck} text={`vulkaninfo --summary | grep -E "driverName|apiVersion|deviceName"`} />
    </section>
  )
}

const isOperatingSystem = Schema.is(OperatingSystem)
const isVulkanSupport = Schema.is(VulkanSupport)

function Manual() {
  const evaluate = useEvaluate()
  const t = useT()
  const m = t.diagnosis.manual
  const [os, setOs] = useState<OperatingSystem>('Windows')
  const [vulkan, setVulkan] = useState<VulkanSupport>('desconocido')
  const r = useAction(ManualForm, ({ data }) => evaluate(manualInput(data)), {
    onFailure: payloadErrors('form'),
    onComplete: () => undefined,
  })
  return (
    <section className="card stack" aria-labelledby="manual">
      <h2 id="manual" className="no-margin">
        {m.heading}
      </h2>
      <p className="small muted">{m.intro}</p>
      <form className="form" {...r.form}>
        <FieldError errors={r.errors} field="form" />
        <div className="fields-2">
          <div>
            <label htmlFor="sistema">{m.system}</label>
            <select {...fieldProps(r.errors, 'sistema')} value={os} onChange={(e) => isOperatingSystem(e.currentTarget.value) && setOs(e.currentTarget.value)}>
              {OperatingSystem.literals.map((s) => (
                <option key={s} value={s}>
                  {operatingSystemLabel[s]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="version_sistema">{m.version}</label>
            <input {...fieldProps(r.errors, 'version_sistema')} placeholder={os === 'Windows' ? 'Windows 11' : m.kernelPlaceholder} defaultValue={os === 'Windows' ? 'Windows 11' : ''} key={os} />
            <FieldError errors={r.errors} field="version_sistema" />
          </div>
        </div>
        <label htmlFor="dispositivo">{m.device}</label>
        <select {...fieldProps(r.errors, 'dispositivo')} defaultValue="null">
          <option value="null">{m.pc}</option>
          {Device.literals.map((d) => (
            <option key={d} value={d}>
              {device[d]}
            </option>
          ))}
        </select>
        {os === 'Linux' && (
          <div className="fields-2">
            <div>
              <label htmlFor="distribucion[nombre]">{m.distribution}</label>
              <input {...fieldProps(r.errors, 'distribucion[nombre]')} placeholder="Linux Mint" />
              <FieldError errors={r.errors} field="distribucion[nombre]" />
            </div>
            <div>
              <label htmlFor="distribucion[version]">{m.distributionVersion}</label>
              <input {...fieldProps(r.errors, 'distribucion[version]')} placeholder={m.distributionVersionPlaceholder} />
              <FieldError errors={r.errors} field="distribucion[version]" />
            </div>
          </div>
        )}
        <label htmlFor="cpu_modelo">{m.cpu}</label>
        <input {...fieldProps(r.errors, 'cpu_modelo')} placeholder="Intel Core i5-4590" />
        <FieldError errors={r.errors} field="cpu_modelo" />
        <label htmlFor="gpu_modelo">{m.gpu}</label>
        <input {...fieldProps(r.errors, 'gpu_modelo')} placeholder="NVIDIA GeForce GTX 1050" />
        <FieldError errors={r.errors} field="gpu_modelo" />
        <div className="fields-2">
          <div>
            <label htmlFor="ram_mb">{m.ram}</label>
            <select {...fieldProps(r.errors, 'ram_mb')} defaultValue="8192">
              {ramGb.map((gb) => (
                <option key={gb} value={gb * 1024}>
                  {gb} GB
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="vram_mb">{m.vram}</label>
            <select {...fieldProps(r.errors, 'vram_mb')} defaultValue="null">
              <option value="null">{m.dontKnow}</option>
              {vramMb.map((mb) => (
                <option key={mb} value={mb}>
                  {memory(mb)}
                </option>
              ))}
            </select>
          </div>
        </div>
        {os === 'Linux' && (
          <div className="fields-2">
            <div>
              <label htmlFor="soporte_vulkan">Vulkan</label>
              <select {...fieldProps(r.errors, 'soporte_vulkan')} value={vulkan} onChange={(e) => isVulkanSupport(e.currentTarget.value) && setVulkan(e.currentTarget.value)}>
                <option value="desconocido">{m.dontKnow}</option>
                <option value="si">{t.vulkanSupport.si}</option>
                <option value="no">{t.vulkanSupport.no}</option>
              </select>
            </div>
            <div>
              <label htmlFor="version_vulkan">{m.vulkanVersion}</label>
              {vulkan === 'si' ? (
                <select {...fieldProps(r.errors, 'version_vulkan')} defaultValue="null">
                  <option value="null">{m.dontKnow}</option>
                  {vulkanVersions.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              ) : (
                <>
                  <input id="version_vulkan" disabled value={m.onlyWithSupport} />
                  <input type="hidden" name="version_vulkan" value="null" />
                </>
              )}
            </div>
          </div>
        )}
        <label htmlFor="arquitectura">{m.architecture}</label>
        <select {...fieldProps(r.errors, 'arquitectura')} defaultValue="x86_64">
          <option value="x86_64">{m.x86}</option>
          <option value="aarch64">aarch64 (ARM)</option>
        </select>
        <button type="submit" disabled={r.submitting}>
          {r.submitting ? t.diagnosis.evaluating : m.evaluate}
        </button>
      </form>
    </section>
  )
}
