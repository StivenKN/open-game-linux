import { Link } from '@tanstack/react-router'
import type { Diagnostic, Machine } from '../../domain/tables.ts'
import { memory } from '../format.ts'
import { useLang, useT } from '../i18n/messages.ts'
import { operatingSystem } from '../vocabulary.ts'

type SavedMachine = Pick<Machine, 'id' | 'alias'> & {
  readonly diagnostics: ReadonlyArray<Pick<Diagnostic, 'id' | 'captured_at' | 'operating_system' | 'gpu_model' | 'ram_mb'> & { readonly distribution: string | null }>
}

/** The visitor's machines and their saved diagnostics, newest first; on /diagnostico and /mis-aportes. */
export function SavedMachines({ machines }: { machines: ReadonlyArray<SavedMachine> }) {
  const t = useT()
  const lang = useLang()
  return machines.map((e) => (
    <div key={e.id} className="card stack">
      <h3 className="no-margin">{e.alias}</h3>
      {e.diagnostics.length === 0 ? (
        <p className="small muted">{t.diagnosis.machines.none}</p>
      ) : (
        <ul className="stack">
          {e.diagnostics.map((d) => (
            <li key={d.id}>
              <Link to="/$lang/diagnosticos/$diagnosticId" params={{ lang, diagnosticId: d.id }}>
                {t.dateTime(d.captured_at)}
              </Link>{' '}
              <span className="small muted datum">
                {d.distribution ?? operatingSystem[d.operating_system]} · {d.gpu_model} · {memory(d.ram_mb)} RAM
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  ))
}
