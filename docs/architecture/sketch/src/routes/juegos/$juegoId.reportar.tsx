// RF-08 report form. A violated rule comes back as data and lands on its field.
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { Schema } from 'effect'
import { NuevoReporte } from '../../dominio/aportes.ts'
import { PerfilId } from '../../dominio/ids.ts'
import { opcionesReporteFn, registrarReporteFn } from '../../fns/aportes.ts'
import { erroresDeRegla, useAccion, type Errores } from '../../ui/useAccion.ts'

export const Route = createFileRoute('/juegos/$juegoId/reportar')({
  validateSearch: Schema.toStandardSchemaV1(Schema.Struct({ perfil: Schema.optionalKey(PerfilId) })),
  beforeLoad: ({ context }) => {
    if (!context.visitante) throw redirect({ to: '/entrar' })
  },
  loaderDeps: ({ search }) => ({ perfil: search.perfil ?? null }),
  loader: ({ params, deps }) => opcionesReporteFn({ data: { juegoId: params.juegoId, perfil: deps.perfil } }),
  component: Reportar,
})

function ErrorCampo({ errores, campo }: { errores: Errores; campo: string }) {
  const mensaje = errores[campo]
  return mensaje ? <p role="alert">{mensaje}</p> : null
}

function Reportar() {
  const opciones = Route.useLoaderData()
  const { juegoId } = Route.useParams()
  const navigate = useNavigate()
  const r = useAccion(NuevoReporte, registrarReporteFn, {
    alFallar: erroresDeRegla, // registrarReporte can only fail with ReglaIncumplida; the type says so
    alCompletar: () => navigate({ to: '/juegos/$juegoId', params: { juegoId } }),
  })
  return (
    <form action={r.enviar}>
      <select name="diagnostico_id">
        {opciones.diagnosticos.map((d) => (
          <option key={d.id} value={d.id}>{d.equipo} · {d.distribucion}</option>
        ))}
      </select>
      <ErrorCampo errores={r.errores} campo="diagnostico_id" />
      {/* edicion_id, version_capa[_tag|id|...], perfil_id (only comparable ones), version_juego, fecha_prueba,
          resultado, fallos[i][tipo_fallo_id|detalle], medicion[...], observaciones: same pattern */}
      <ErrorCampo errores={r.errores} campo="perfil_id" />
      <ErrorCampo errores={r.errores} campo="fallos" />
      <button disabled={r.enviando}>Enviar reporte</button>
    </form>
  )
}
