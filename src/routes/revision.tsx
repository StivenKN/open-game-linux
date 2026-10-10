// RF-10 review queue. Blockers come from the same function decidir runs, so a disabled "Aprobar" always
// says why. Route guards are UX only: cola and decidir check the reviewer role again.
import { createFileRoute, Link, notFound, redirect, useRouter } from '@tanstack/react-router'
import { Schema } from 'effect'
import type { ReactNode } from 'react'
import { avisoTransicionInvalida, type AprobacionBloqueada, type Codificado, type ReglaIncumplida, type TransicionInvalida } from '../dominio/fallos.ts'
import { AporteRef, Decision, TipoAporte } from '../dominio/revision.ts'
import { colaFn, decidirFn } from '../fns/revision.ts'
import { Chip, Insignia } from '../ui/Insignia.tsx'
import { ErrorCampo } from '../ui/ErrorCampo.tsx'
import { contar, fecha, fps, momento } from '../ui/formato.ts'
import { erroresDeRegla, type Errores, useAccion } from '../ui/useAccion.ts'
import { bloqueo, estadoRevision, resultado, tipoFallo } from '../ui/vocabulario.ts'

export const Route = createFileRoute('/revision')({
  validateSearch: Schema.toStandardSchemaV1(Schema.Struct({ tipo: Schema.optionalKey(TipoAporte) })),
  beforeLoad: ({ context }) => {
    if (context.visitante === null) throw redirect({ to: '/entrar' })
    if (context.visitante.rol === 'usuario') throw notFound()
  },
  loaderDeps: ({ search }) => ({ tipo: search.tipo ?? 'reporte' }),
  loader: ({ deps }) => colaFn({ data: deps }),
  head: () => ({ meta: [{ title: 'Revisión · OpenGame Linux' }] }),
  component: Revision,
})

const pestanas = { reporte: 'Reportes', perfil: 'Perfiles', solucion: 'Soluciones' } as const satisfies Record<TipoAporte, string>

type Cola = Awaited<ReturnType<typeof colaFn>>
type ElementoDe<T extends Cola['tipo']> = Extract<Cola, { tipo: T }>['elementos'][number]

function Revision() {
  const cola = Route.useLoaderData()
  const pendientes = cola.elementos.filter((e) => e.estado_revision === 'pendiente').length
  return (
    <main className="envoltura">
      <h1>Revisión de aportes</h1>
      <p className="tenue">
        Aprobar exige evidencia verificable. Lo pendiente no cuenta en ningún resumen; lo aprobado se puede retirar si deja de ser válido.
      </p>
      <nav aria-label="Tipo de aporte" className="fila pestanas">
        {TipoAporte.literals.map((t) => (
          <Link key={t} to="/revision" search={{ tipo: t }} aria-current={t === cola.tipo ? 'page' : undefined} className={t === cola.tipo ? 'boton' : 'boton-secundario'}>
            {pestanas[t]}
          </Link>
        ))}
      </nav>
      <p className="pequeno tenue">{contar(pendientes, 'pendiente', 'pendientes')}</p>
      {cola.elementos.length === 0 && <p className="tarjeta">No hay {pestanas[cola.tipo].toLowerCase()} pendientes ni aprobados.</p>}
      {/* Keyed by state too, so a decided row remounts with an empty form instead of keeping the old motivo. */}
      <div className="pila">
        {cola.tipo === 'reporte' &&
          cola.elementos.map((e) => (
            <Elemento key={`${e.id}-${e.estado_revision}`} refAporte={{ _tag: 'reporte', id: e.id }} elemento={e}>
              <DetalleReporte e={e} />
            </Elemento>
          ))}
        {cola.tipo === 'perfil' &&
          cola.elementos.map((e) => (
            <Elemento key={`${e.id}-${e.estado_revision}`} refAporte={{ _tag: 'perfil', id: e.id }} elemento={e}>
              <DetallePerfil e={e} />
            </Elemento>
          ))}
        {cola.tipo === 'solucion' &&
          cola.elementos.map((e) => (
            <Elemento key={`${e.id}-${e.estado_revision}`} refAporte={{ _tag: 'solucion', id: e.id }} elemento={e}>
              <DetalleSolucion e={e} />
            </Elemento>
          ))}
      </div>
    </main>
  )
}

const FormDecision = Schema.Struct({ ref: AporteRef, decision: Decision })

/** One queue row: its evidence (children), its blockers, and the decision form. */
function Elemento({ refAporte, elemento, children }: { refAporte: AporteRef; elemento: ElementoDe<Cola['tipo']>; children: ReactNode }) {
  const router = useRouter()
  const r = useAccion(FormDecision, decidirFn, {
    // Exhaustive over what decidir can return: a new failure in decidir breaks this switch.
    alFallar: (f: Codificado<ReglaIncumplida | TransicionInvalida | AprobacionBloqueada>): Errores => {
      switch (f._tag) {
        case 'ReglaIncumplida':
          return erroresDeRegla(f)
        case 'TransicionInvalida':
          return { decision: avisoTransicionInvalida.mensaje }
        case 'AprobacionBloqueada':
          return { decision: f.bloqueos.map((b) => bloqueo[b]).join(' ') }
      }
    },
    alCompletar: () => router.invalidate(),
  })
  const pendiente = elemento.estado_revision === 'pendiente'
  const titulo = `${refAporte._tag}-${refAporte.id}`

  return (
    <article className="tarjeta pila" aria-labelledby={titulo}>
      <header className="fila">
        <Insignia etiqueta={estadoRevision[elemento.estado_revision]} />
        <strong id={titulo}>{elemento.juego}</strong>
        <span className="dato tenue">{elemento.lanzador}</span>
        <span className="pequeno tenue">
          por {elemento.autor} · {fecha(elemento.creado_en)}
        </span>
        {elemento.demo && <span className="sello">Datos de ejemplo</span>}
      </header>
      {children}
      {elemento.bloqueos.length > 0 && (
        <ul className="nota pequeno" data-tono="amarillo" aria-label="Por qué no se puede aprobar todavía">
          {elemento.bloqueos.map((b) => (
            <li key={b}>{bloqueo[b]}</li>
          ))}
        </ul>
      )}
      {elemento.es_propio ? (
        <p className="pequeno tenue">Es tu aporte: otro revisor debe decidir sobre él.</p>
      ) : (
        <form className="formulario decision" {...r.formulario}>
          <ErrorCampo errores={r.errores} campo="formulario" />
          <input type="hidden" name="ref[_tag]" value={refAporte._tag} />
          <input type="hidden" name="ref[id]" value={refAporte.id} />
          <label>
            Motivo
            <textarea name="decision[motivo]" rows={2} aria-invalid={r.errores['decision[motivo]'] !== undefined} />
          </label>
          <ErrorCampo errores={r.errores} campo="decision[motivo]" />
          {pendiente && (
            <>
              <label>
                Evidencia (para aprobar)
                <textarea
                  name="decision[evidencia]"
                  rows={2}
                  placeholder="Referencia verificable: captura, registro o reporte identificado"
                  aria-invalid={r.errores['decision[evidencia]'] !== undefined}
                />
              </label>
              <ErrorCampo errores={r.errores} campo="decision[evidencia]" />
            </>
          )}
          <ErrorCampo errores={r.errores} campo="decision" />
          <div className="fila">
            {pendiente ? (
              <>
                <button type="submit" name="decision[_tag]" value="Aprobar" disabled={r.enviando || elemento.bloqueos.length > 0}>
                  Aprobar
                </button>
                <button type="submit" name="decision[_tag]" value="Rechazar" className="boton-secundario" disabled={r.enviando}>
                  Rechazar
                </button>
              </>
            ) : (
              <button type="submit" name="decision[_tag]" value="Retirar" className="boton-secundario" disabled={r.enviando}>
                Retirar
              </button>
            )}
          </div>
        </form>
      )}
    </article>
  )
}

function DetalleReporte({ e }: { e: ElementoDe<'reporte'> }) {
  return (
    <>
      <p className="fila">
        <Insignia etiqueta={resultado[e.resultado]} />
        <span className="dato">
          {e.distribucion} · {e.arquitectura} · {e.capa} · versión {e.version_juego} · probado el {momento(e.fecha_prueba)}
        </span>
      </p>
      <p className="pequeno">{e.perfil === null ? 'Sin perfil.' : `Siguió el perfil «${e.perfil}».`}</p>
      {e.fps_promedio !== null && (
        <p className="pequeno">
          <span className="fps">{fps(e.fps_promedio)} FPS</span> · {e.resolucion} · {e.calidad_grafica} · {e.metodo_medicion}
        </p>
      )}
      {e.fallos.length > 0 && (
        <ul className="pequeno">
          {e.fallos.map((f) => (
            <li key={f.codigo}>
              <Chip tono={tipoFallo(f.codigo).tono}>{tipoFallo(f.codigo).texto}</Chip> {f.detalle}
            </li>
          ))}
        </ul>
      )}
      <p>{e.observaciones}</p>
    </>
  )
}

function DetallePerfil({ e }: { e: ElementoDe<'perfil'> }) {
  return (
    <>
      <p>
        <strong>{e.titulo}</strong> <span className="dato tenue">r{e.revision}</span>
      </p>
      <p className="dato">
        {e.distribucion} · {e.arquitectura} · {e.capa}
        {e.version_juego_objetivo !== null && ` · versión ${e.version_juego_objetivo}`}
      </p>
      <p className="pequeno">
        {contar(e.pasos, 'paso', 'pasos')} · {contar(e.reportes_funcionales, 'reporte funcional aprobado', 'reportes funcionales aprobados')}
      </p>
      {e.parametros_lanzamiento !== null && <pre className="dato">{e.parametros_lanzamiento}</pre>}
    </>
  )
}

function DetalleSolucion({ e }: { e: ElementoDe<'solucion'> }) {
  return (
    <>
      <p>
        <strong>{e.titulo}</strong>
      </p>
      <p className="pequeno">
        Responde a <Chip tono={tipoFallo(e.tipo_fallo).tono}>{tipoFallo(e.tipo_fallo).texto}</Chip> «{e.fallo}» del reporte #{e.reporte_id} (
        {estadoRevision[e.estado_reporte].texto.toLowerCase()}).
      </p>
      <p className="pequeno">{e.perfil === null ? 'No recomienda un perfil.' : `Recomienda el perfil «${e.perfil}».`}</p>
      <p className="instrucciones">{e.instrucciones}</p>
    </>
  )
}
