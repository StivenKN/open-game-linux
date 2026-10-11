// RF-08 report form. `$juegoId_` keeps this page out of the ficha's layout (it renders on its own).
// Profiles on offer are the ones `discrepancias` finds comparable with what the user picked; a violated
// rule comes back as data and lands under its field.
import { createFileRoute, Link, redirect } from '@tanstack/react-router'
import { Schema } from 'effect'
import { useState } from 'react'
import { discrepancias, NuevoReporte } from '../../dominio/aportes.ts'
import { type Codificado, discrepanciasPerfil, type PerfilNoComparable, type ReglaIncumplida } from '../../dominio/fallos.ts'
import { FamiliaCapa, exigeFallo, Resultado } from '../../dominio/literales.ts'
import { JuegoId, PerfilId, type ReporteId } from '../../dominio/ids.ts'
import { opcionesReporteFn, registrarReporteFn } from '../../fns/aportes.ts'
import { ErrorCampo } from '../../ui/ErrorCampo.tsx'
import { momento } from '../../ui/formato.ts'
import { Campo, campo, GrupoOpcional, nulo } from '../../ui/formulario.tsx'
import { erroresDeRegla, type Errores, useAccion } from '../../ui/useAccion.ts'
import { estadoRevision, resultado as etiquetaResultado, tipoFallo } from '../../ui/vocabulario.ts'
import { idDeRuta } from '../-ids.ts'
import { volverAqui } from '../-volver.ts'

const juegoId = idDeRuta(JuegoId)

export const Route = createFileRoute('/juegos/$juegoId_/reportar')({
  params: { parse: (p) => ({ juegoId: juegoId(p.juegoId) }), stringify: (p) => ({ juegoId: String(p.juegoId) }) },
  // The router already parses `?perfil=7` into a number.
  validateSearch: Schema.toStandardSchemaV1(Schema.Struct({ perfil: Schema.optionalKey(PerfilId) })),
  beforeLoad: ({ context, location }) => {
    if (context.visitante === null) throw redirect({ to: '/entrar', search: volverAqui(location) })
  },
  loaderDeps: ({ search }) => ({ perfil: search.perfil ?? null }),
  loader: ({ params, deps }) => opcionesReporteFn({ data: { juegoId: params.juegoId, perfil: deps.perfil } }),
  head: ({ loaderData }) => ({ meta: [{ title: `Reportar ${loaderData?.juego.titulo ?? 'resultado'} · OpenGame Linux` }] }),
  component: Reportar,
})

type Opciones = Awaited<ReturnType<typeof opcionesReporteFn>>

function Reportar() {
  const opciones = Route.useLoaderData()
  const [enviado, setEnviado] = useState<{ readonly id: ReporteId; readonly conFallos: boolean } | null>(null)
  const { juego } = opciones

  return (
    <main className="envoltura">
      <p className="rotulo">Reportar resultado</p>
      <h1>{juego.titulo}</h1>
      {enviado !== null ? (
        <section className="tarjeta pila" aria-live="polite">
          <h2>Reporte enviado</h2>
          <p>
            Queda <strong>pendiente de revisión</strong> y no cuenta en el resumen del juego hasta que un revisor lo apruebe.
          </p>
          <p className="fila">
            <Link to="/juegos/$juegoId" params={{ juegoId: juego.id }}>
              Volver a la ficha del juego
            </Link>
            {enviado.conFallos && (
              <Link to="/reportes/$reporteId/solucion" params={{ reporteId: enviado.id }}>
                ¿Conoces una solución? Propónla
              </Link>
            )}
            <button type="button" className="boton-secundario" onClick={() => setEnviado(null)}>
              Reportar otro resultado
            </button>
          </p>
        </section>
      ) : opciones.diagnosticos.length === 0 ? (
        <section className="tarjeta nota pila">
          <p>Para reportar necesitas un diagnóstico de tu equipo hecho en Linux: el reporte guarda el entorno exacto de la prueba.</p>
          <p>
            <Link to="/diagnostico">Hacer un diagnóstico</Link>
          </p>
        </section>
      ) : (
        <FormReporte opciones={opciones} alEnviar={setEnviado} />
      )}
    </main>
  )
}

/** The branded id of the option a select now shows. */
const porId = <I extends number>(lista: ReadonlyArray<{ readonly id: I }>, valor: string) => lista.find((x) => String(x.id) === valor)?.id

/** Display names for the ids a PerfilNoComparable carries, from what the page already loaded. */
const nombres = (o: Opciones) => {
  const distribuciones = new Map<number, string>([
    ...o.perfiles.map((p) => [p.distribucion_id, p.distribucion] as const),
    ...o.diagnosticos.map((d) => [d.distribucion_id, d.distribucion] as const),
  ])
  const capa = (id: number) => {
    const c = o.capas.find((x) => x.id === id)
    return c === undefined ? 'otra capa' : `${c.familia} ${c.variante} ${c.version}`
  }
  return (d: Codificado<PerfilNoComparable>['discrepancias'][number]): readonly [string, string] => {
    switch (d.de) {
      case 'edicion':
        return [o.ediciones.find((e) => e.id === d.esperado)?.lanzador ?? 'otra edición', o.ediciones.find((e) => e.id === d.observado)?.lanzador ?? 'otra edición']
      case 'capa':
        return [capa(d.esperado), capa(d.observado)]
      case 'distribucion':
        return [distribuciones.get(d.esperado) ?? 'otra distribución', distribuciones.get(d.observado) ?? 'otra distribución']
      case 'arquitectura':
      case 'version_juego':
        return [d.esperado, d.observado]
    }
  }
}

function FormReporte({ opciones, alEnviar }: { opciones: Opciones; alEnviar: (enviado: { readonly id: ReporteId; readonly conFallos: boolean }) => void }) {
  const { diagnosticos, ediciones, capas, perfiles, tiposFallo, perfilElegido } = opciones
  const elegido = perfiles.find((p) => p.id === perfilElegido)

  // The four choices comparability depends on are controlled, so the profile list can follow them.
  const [diagnosticoId, setDiagnosticoId] = useState(diagnosticos.at(0)?.id)
  const [edicionId, setEdicionId] = useState(elegido?.edicion_id ?? ediciones.at(0)?.id)
  const [tipoCapa, setTipoCapa] = useState<'existente' | 'nueva'>('existente')
  const [capaId, setCapaId] = useState(elegido?.version_capa_id ?? capas.at(0)?.id)
  const [versionJuego, setVersionJuego] = useState(elegido?.version_juego_objetivo ?? '')
  const [perfilId, setPerfilId] = useState(elegido === undefined ? nulo : String(elegido.id))
  const [resultado, setResultado] = useState<Resultado>('funciona')
  const [fallos, setFallos] = useState<ReadonlyArray<number>>([])
  const [siguienteFallo, setSiguienteFallo] = useState(0)

  const diagnostico = diagnosticos.find((d) => d.id === diagnosticoId)
  const prueba =
    diagnostico !== undefined && edicionId !== undefined && capaId !== undefined && tipoCapa === 'existente'
      ? { edicion_id: edicionId, version_capa_id: capaId, distribucion_id: diagnostico.distribucion_id, arquitectura: diagnostico.arquitectura, version_juego: versionJuego.trim() }
      : null
  // A preselected profile (?perfil=) stays on offer even when it does not fit, so submitting it explains why.
  const comparables = perfiles.filter((p) => p.id === perfilElegido || (prueba !== null && discrepancias(prueba, p).length === 0))
  const perfilValor = comparables.some((p) => String(p.id) === perfilId) ? perfilId : nulo

  const nombreDe = nombres(opciones)
  const r = useAccion(NuevoReporte, registrarReporteFn, {
    alFallar: (f: Codificado<ReglaIncumplida | PerfilNoComparable>): Errores => {
      switch (f._tag) {
        case 'ReglaIncumplida':
          return erroresDeRegla(f)
        case 'PerfilNoComparable': {
          const errores: Record<string, string> = {}
          for (const d of f.discrepancias) {
            const { campo: c, mensaje } = discrepanciasPerfil[d.de]
            errores[c] = [errores[c], mensaje(...nombreDe(d))].filter((m) => m !== undefined).join(' ')
          }
          return errores
        }
      }
    },
    alCompletar: (v) => alEnviar({ id: v.id, conFallos: fallos.length > 0 }),
  })

  const agregarFallo = () => {
    setFallos([...fallos, siguienteFallo])
    setSiguienteFallo(siguienteFallo + 1)
  }

  return (
    <form className="tarjeta formulario formulario-ancho" {...r.formulario}>
      <ErrorCampo errores={r.errores} campo="formulario" />

      <h2 className="titulo-seccion">Dónde probaste</h2>
      <Campo errores={r.errores} nombre="diagnostico_id" etiqueta="Diagnóstico del equipo" ayuda="Solo aparecen tus diagnósticos hechos en Linux.">
        <select {...campo(r.errores, 'diagnostico_id')} value={diagnosticoId ?? ''} onChange={(e) => setDiagnosticoId(porId(diagnosticos, e.currentTarget.value))}>
          {diagnosticos.map((d) => (
            <option key={d.id} value={d.id}>
              {d.equipo} · {d.distribucion} · {d.arquitectura} · {momento(d.capturado_en)}
            </option>
          ))}
        </select>
      </Campo>
      <Campo errores={r.errores} nombre="edicion_id" etiqueta="Edición (lanzador)">
        <select {...campo(r.errores, 'edicion_id')} value={edicionId ?? ''} onChange={(e) => setEdicionId(porId(ediciones, e.currentTarget.value))}>
          {ediciones.map((e) => (
            <option key={e.id} value={e.id}>
              {e.lanzador}
            </option>
          ))}
        </select>
      </Campo>

      <fieldset className="grupo">
        <legend>Capa de compatibilidad usada</legend>
        <div className="fila">
          <label className="casilla">
            <input type="radio" name="version_capa[_tag]" value="existente" checked={tipoCapa === 'existente'} onChange={() => setTipoCapa('existente')} />
            Una versión de la lista
          </label>
          <label className="casilla">
            <input type="radio" name="version_capa[_tag]" value="nueva" checked={tipoCapa === 'nueva'} onChange={() => setTipoCapa('nueva')} />
            Otra versión
          </label>
        </div>
        {tipoCapa === 'existente' ? (
          <Campo errores={r.errores} nombre="version_capa[id]" etiqueta="Versión">
            <select {...campo(r.errores, 'version_capa[id]')} value={capaId ?? ''} onChange={(e) => setCapaId(porId(capas, e.currentTarget.value))}>
              {capas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.familia} {c.variante} {c.version}
                </option>
              ))}
            </select>
          </Campo>
        ) : (
          <div className="fila campos-en-linea">
            <Campo errores={r.errores} nombre="version_capa[familia]" etiqueta="Familia">
              <select {...campo(r.errores, 'version_capa[familia]')}>
                {FamiliaCapa.literals.map((f) => (
                  <option key={f}>{f}</option>
                ))}
              </select>
            </Campo>
            <Campo errores={r.errores} nombre="version_capa[variante]" etiqueta="Variante">
              <input {...campo(r.errores, 'version_capa[variante]')} placeholder="GE" />
            </Campo>
            <Campo errores={r.errores} nombre="version_capa[version]" etiqueta="Versión exacta">
              <input {...campo(r.errores, 'version_capa[version]')} placeholder="9-20" />
            </Campo>
          </div>
        )}
        <ErrorCampo errores={r.errores} campo="version_capa" />
      </fieldset>

      <div className="fila campos-en-linea">
        <Campo errores={r.errores} nombre="version_juego" etiqueta="Versión o build del juego">
          <input {...campo(r.errores, 'version_juego')} value={versionJuego} onChange={(e) => setVersionJuego(e.currentTarget.value)} placeholder="1.0.3179" />
        </Campo>
        <Campo errores={r.errores} nombre="version_lanzador" etiqueta="Versión del lanzador (opcional)">
          <input {...campo(r.errores, 'version_lanzador')} />
        </Campo>
      </div>

      <Campo
        errores={r.errores}
        nombre="perfil_id"
        etiqueta="Perfil que seguiste"
        ayuda="Solo aparecen los perfiles que coinciden con tu diagnóstico, la edición, la capa y la versión del juego."
      >
        <select {...campo(r.errores, 'perfil_id')} value={perfilValor} onChange={(e) => setPerfilId(e.currentTarget.value)}>
          <option value={nulo}>Sin perfil</option>
          {comparables.map((p) => (
            <option key={p.id} value={p.id}>
              {p.titulo} (r{p.revision}, {estadoRevision[p.estado_revision].texto.toLowerCase()}) · {p.distribucion}
            </option>
          ))}
        </select>
      </Campo>

      <h2 className="titulo-seccion">Qué pasó</h2>
      <Campo errores={r.errores} nombre="fecha_prueba" etiqueta="Fecha y hora de la prueba">
        <input {...campo(r.errores, 'fecha_prueba')} type="datetime-local" />
      </Campo>
      <fieldset className="grupo">
        <legend>Resultado</legend>
        <div className="fila">
          {Resultado.literals.map((valor) => (
            <label key={valor} className="casilla">
              <input type="radio" name="resultado" value={valor} checked={resultado === valor} onChange={() => setResultado(valor)} />
              {etiquetaResultado[valor].texto}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="grupo">
        <legend>Fallos observados</legend>
        <p className="pequeno tenue">
          {exigeFallo[resultado]
            ? 'Indica al menos un tipo de fallo. Si no sabes la causa, elige «Otro» y describe el síntoma.'
            : 'Opcional: anota cualquier problema aunque el juego funcione.'}
        </p>
        {fallos.map((clave, i) => (
          <div key={clave} className="fila campos-en-linea">
            <Campo errores={r.errores} nombre={`fallos[${i}][tipo_fallo_id]`} etiqueta="Tipo">
              <select {...campo(r.errores, `fallos[${i}][tipo_fallo_id]`)}>
                {tiposFallo.map((t) => (
                  <option key={t.id} value={t.id} title={t.descripcion}>
                    {tipoFallo(t.codigo).texto}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo errores={r.errores} nombre={`fallos[${i}][detalle]`} etiqueta="Qué viste">
              <input {...campo(r.errores, `fallos[${i}][detalle]`)} />
            </Campo>
            <button type="button" className="boton-secundario" onClick={() => setFallos(fallos.filter((f) => f !== clave))}>
              Quitar
            </button>
          </div>
        ))}
        <p>
          <button type="button" className="boton-secundario" onClick={agregarFallo}>
            Añadir un fallo
          </button>
        </p>
        <ErrorCampo errores={r.errores} campo="fallos" />
      </fieldset>

      <GrupoOpcional nombre="medicion" etiqueta="Medí los FPS">
        <p className="pequeno tenue">Sin medición el reporte no guarda FPS; nunca se convierte en cero.</p>
        <div className="fila campos-en-linea">
          <Campo errores={r.errores} nombre="medicion[fps_promedio]" etiqueta="FPS promedio">
            <input {...campo(r.errores, 'medicion[fps_promedio]')} type="number" inputMode="decimal" min="0" step="0.01" />
          </Campo>
          <Campo errores={r.errores} nombre="medicion[resolucion]" etiqueta="Resolución">
            <input {...campo(r.errores, 'medicion[resolucion]')} placeholder="1920x1080" />
          </Campo>
          <Campo errores={r.errores} nombre="medicion[calidad_grafica]" etiqueta="Calidad gráfica">
            <input {...campo(r.errores, 'medicion[calidad_grafica]')} placeholder="Medio" />
          </Campo>
        </div>
        <Campo errores={r.errores} nombre="medicion[metodo_medicion]" etiqueta="Cómo mediste">
          <input {...campo(r.errores, 'medicion[metodo_medicion]')} placeholder="MangoHud · escena · duración" />
        </Campo>
      </GrupoOpcional>

      <Campo errores={r.errores} nombre="observaciones" etiqueta="Observaciones" ayuda="Resultado, limitaciones y cualquier ajuste extra que hiciste fuera del perfil.">
        <textarea {...campo(r.errores, 'observaciones')} rows={4} />
      </Campo>

      <button type="submit" disabled={r.enviando}>
        {r.enviando ? 'Enviando…' : 'Enviar reporte'}
      </button>
    </form>
  )
}
