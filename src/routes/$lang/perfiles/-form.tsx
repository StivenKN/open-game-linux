// The fields a profile's author fills in, shared by the propose and edit pages. Rows are keyed, not
// indexed, so removing or moving a step keeps what the user typed in the others.
import { useRef, useState } from 'react'
import type { profileEditOptionsFn, profileOptionsFn } from '../../../fns/contributions.ts'
import { FieldError } from '../../../ui/FieldError.tsx'
import { Field, fieldProps, nullText, ramGb, vramMb, vulkanVersions } from '../../../ui/form.tsx'
import { memory } from '../../../ui/format.ts'
import type { FieldErrors } from '../../../ui/useAction.ts'

export type ProfileDraft = Awaited<ReturnType<typeof profileEditOptionsFn>>['draft']
type DependencyOption = Awaited<ReturnType<typeof profileOptionsFn>>['dependencies'][number]

type Row<T> = { readonly key: number; readonly value: T | null }

function useRows<T>(initial: ReadonlyArray<T>, blank: number) {
  const [rows, setRows] = useState<ReadonlyArray<Row<T>>>(() => [
    ...initial.map((value, key) => ({ key, value })),
    ...Array.from({ length: blank }, (_, i) => ({ key: initial.length + i, value: null })),
  ])
  const nextKey = useRef(rows.length)
  const add = () => {
    setRows([...rows, { key: nextKey.current, value: null }])
    nextKey.current += 1
  }
  const remove = (key: number) => setRows(rows.filter((r) => r.key !== key))
  const swap = (i: number, j: number) => {
    const a = rows[i]
    const b = rows[j]
    if (a === undefined || b === undefined) return
    setRows(rows.map((r, k) => (k === i ? b : k === j ? a : r)))
  }
  return { rows, add, remove, swap }
}

export function ProfileContentFields({
  errors,
  dependencies,
  draft,
}: {
  errors: FieldErrors
  dependencies: ReadonlyArray<DependencyOption>
  draft: ProfileDraft | null
}) {
  const [vulkan, setVulkan] = useState(String(draft?.requires_vulkan ?? nullText))
  return (
    <>
      <Field errors={errors} name="title" label="Título" help="Qué logra el perfil, por ejemplo «GTA V en gráficos bajos con Proton 8».">
        <input {...fieldProps(errors, 'title')} defaultValue={draft?.title} />
      </Field>
      <Field
        errors={errors}
        name="target_game_version"
        label="Versión del juego (opcional)"
        help="Solo si el perfil sirve para una versión concreta: un reporte con otra versión no podrá usarlo."
      >
        <input {...fieldProps(errors, 'target_game_version')} defaultValue={draft?.target_game_version ?? ''} placeholder="1.0.3179" />
      </Field>

      <h2 className="section-title">Pasos</h2>
      <StepRows errors={errors} initial={draft?.steps ?? []} />
      <Field errors={errors} name="launch_options" label="Parámetros de lanzamiento (opcional)" help="Quien siga el perfil los copia tal cual en su lanzador.">
        <input {...fieldProps(errors, 'launch_options')} defaultValue={draft?.launch_options ?? ''} placeholder="gamemoderun %command%" />
      </Field>

      <h2 className="section-title">Dependencias</h2>
      <DependencyRows errors={errors} catalog={dependencies} initial={draft?.dependencies ?? []} />

      <h2 className="section-title">Condiciones conocidas</h2>
      <p className="small muted">La página del perfil compara la RAM, la VRAM y Vulkan con el diagnóstico de quien la abre. Lo que no declares no se compara.</p>
      <div className="fields-2">
        <Field errors={errors} name="ram_min_mb" label="RAM mínima">
          <select {...fieldProps(errors, 'ram_min_mb')} defaultValue={String(draft?.ram_min_mb ?? nullText)}>
            <option value={nullText}>Sin declarar</option>
            {ramGb.map((gb) => (
              <option key={gb} value={gb * 1024}>
                {gb} GB
              </option>
            ))}
          </select>
        </Field>
        <Field errors={errors} name="vram_min_mb" label="VRAM mínima">
          <select {...fieldProps(errors, 'vram_min_mb')} defaultValue={String(draft?.vram_min_mb ?? nullText)}>
            <option value={nullText}>Sin declarar</option>
            {vramMb.map((mb) => (
              <option key={mb} value={mb}>
                {memory(mb)}
              </option>
            ))}
          </select>
        </Field>
        <Field errors={errors} name="requires_vulkan" label="Vulkan">
          <select {...fieldProps(errors, 'requires_vulkan')} value={vulkan} onChange={(e) => setVulkan(e.currentTarget.value)}>
            <option value={nullText}>Sin declarar</option>
            <option value="true">Obligatorio</option>
            <option value="false">No lo necesita</option>
          </select>
        </Field>
        <Field errors={errors} name="vulkan_version_min" label="Versión mínima de Vulkan">
          <select {...fieldProps(errors, 'vulkan_version_min')} defaultValue={draft?.vulkan_version_min ?? nullText} disabled={vulkan !== 'true'}>
            <option value={nullText}>Cualquiera</option>
            {vulkanVersions.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        {/* A disabled select posts nothing; without Vulkan there is no minimum. */}
        {vulkan !== 'true' && <input type="hidden" name="vulkan_version_min" value={nullText} />}
      </div>
      <Field errors={errors} name="cpu_requirement" label="CPU (opcional)" help="Texto libre: se muestra, no se compara.">
        <input {...fieldProps(errors, 'cpu_requirement')} defaultValue={draft?.cpu_requirement ?? ''} placeholder="4 núcleos con AVX" />
      </Field>
      <Field errors={errors} name="gpu_requirement" label="GPU (opcional)" help="Texto libre: se muestra, no se compara.">
        <input {...fieldProps(errors, 'gpu_requirement')} defaultValue={draft?.gpu_requirement ?? ''} placeholder="GTX 1050 o equivalente" />
      </Field>
    </>
  )
}

function StepRows({ errors, initial }: { errors: FieldErrors; initial: ProfileDraft['steps'] }) {
  const { rows, add, remove, swap } = useRows(initial, initial.length === 0 ? 1 : 0)
  return (
    <>
      <p className="small muted">En el orden en que se siguen. Escribe los comandos tal cual: la página los muestra para copiarlos.</p>
      <ol className="card-list">
        {rows.map((row, i) => (
          <li key={row.key} className="card stack">
            <div className="row">
              <b>Paso {i + 1}</b>
              <button type="button" className="button-secondary" disabled={i === 0} onClick={() => swap(i, i - 1)}>
                Subir
              </button>
              <button type="button" className="button-secondary" disabled={i === rows.length - 1} onClick={() => swap(i, i + 1)}>
                Bajar
              </button>
              <button type="button" className="button-secondary" disabled={rows.length === 1} onClick={() => remove(row.key)}>
                Quitar
              </button>
            </div>
            <Field errors={errors} name={`steps[${i}][title]`} label="Título">
              <input {...fieldProps(errors, `steps[${i}][title]`)} defaultValue={row.value?.title} />
            </Field>
            <Field errors={errors} name={`steps[${i}][instruction]`} label="Qué hacer">
              <textarea {...fieldProps(errors, `steps[${i}][instruction]`)} rows={3} defaultValue={row.value?.instruction} />
            </Field>
          </li>
        ))}
      </ol>
      <p>
        <button type="button" className="button-secondary" onClick={add}>
          Añadir un paso
        </button>
      </p>
      <FieldError errors={errors} field="steps" />
    </>
  )
}

function DependencyRows({ errors, catalog, initial }: { errors: FieldErrors; catalog: ReadonlyArray<DependencyOption>; initial: ProfileDraft['dependencies'] }) {
  const { rows, add, remove } = useRows(initial, 0)
  return (
    <>
      <p className="small muted">Bibliotecas o programas que el juego necesita además de la capa, con el comando para instalarlos.</p>
      {rows.length > 0 && (
        <ul className="card-list">
          {rows.map((row, i) => (
            <DependencyRow key={row.key} errors={errors} index={i} catalog={catalog} initial={row.value} onRemove={() => remove(row.key)} />
          ))}
        </ul>
      )}
      <p>
        <button type="button" className="button-secondary" onClick={add}>
          Añadir una dependencia
        </button>
      </p>
      <FieldError errors={errors} field="dependencies" />
    </>
  )
}

function DependencyRow({
  errors,
  index,
  catalog,
  initial,
  onRemove,
}: {
  errors: FieldErrors
  index: number
  catalog: ReadonlyArray<DependencyOption>
  initial: ProfileDraft['dependencies'][number] | null
  onRemove: () => void
}) {
  const [kind, setKind] = useState<'existente' | 'nueva'>(catalog.length === 0 ? 'nueva' : 'existente')
  const name = (field: string) => `dependencies[${index}]${field}`
  return (
    <li className="card stack">
      <div className="row">
        <label className="checkbox">
          <input type="radio" name={name('[dependency][_tag]')} value="existente" checked={kind === 'existente'} disabled={catalog.length === 0} onChange={() => setKind('existente')} />
          Una de la lista
        </label>
        <label className="checkbox">
          <input type="radio" name={name('[dependency][_tag]')} value="nueva" checked={kind === 'nueva'} onChange={() => setKind('nueva')} />
          Otra
        </label>
        <button type="button" className="button-secondary" onClick={onRemove}>
          Quitar
        </button>
      </div>
      {kind === 'existente' ? (
        <Field errors={errors} name={name('[dependency][id]')} label="Dependencia">
          <select {...fieldProps(errors, name('[dependency][id]'))} defaultValue={initial?.dependency_id}>
            {catalog.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} ({d.package_manager})
              </option>
            ))}
          </select>
        </Field>
      ) : (
        <div className="row inline-fields">
          <Field errors={errors} name={name('[dependency][name]')} label="Nombre">
            <input {...fieldProps(errors, name('[dependency][name]'))} placeholder="vcrun2019" />
          </Field>
          <Field errors={errors} name={name('[dependency][package_manager]')} label="Gestor">
            <input {...fieldProps(errors, name('[dependency][package_manager]'))} placeholder="winetricks" />
          </Field>
          <Field errors={errors} name={name('[dependency][description]')} label="Qué es">
            <input {...fieldProps(errors, name('[dependency][description]'))} placeholder="Bibliotecas de Visual C++ 2019" />
          </Field>
        </div>
      )}
      <FieldError errors={errors} field={name('[dependency]')} />
      <div className="row inline-fields">
        <Field errors={errors} name={name('[required_version]')} label="Versión (opcional)">
          <input {...fieldProps(errors, name('[required_version]'))} defaultValue={initial?.required_version ?? ''} />
        </Field>
        <label className="checkbox">
          <input type="checkbox" name={name('[required]')} value="true" defaultChecked={initial?.required ?? true} />
          Obligatoria
        </label>
      </div>
      <Field errors={errors} name={name('[install_instruction]')} label="Cómo instalarla">
        <input {...fieldProps(errors, name('[install_instruction]'))} defaultValue={initial?.install_instruction} placeholder="protontricks 292030 vcrun2019" />
      </Field>
    </li>
  )
}
