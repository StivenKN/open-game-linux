// 8.11 "La aplicación debe rechazar / permitir ...". Runs the Effect programs directly (no HTTP,
// no server fn) with a test Visitante, inside enRollback. Asserts the returned failure's `regla`.
import { describe, it } from '@effect/vitest'

describe('la aplicación rechaza', () => {
  it.todo('reporte desde un diagnóstico de un equipo ajeno -> ReglaIncumplida equipo_ajeno')
  it.todo('reporte desde un diagnóstico de Windows -> diagnostico_no_linux')
  it.todo('reporte con fecha_prueba anterior al diagnóstico -> fecha_antes_del_diagnostico')
  it.todo('reporte con perfil de otra edición -> perfil_otra_edicion (app check fires before the FK)')
  it.todo('reporte con perfil de otra distribución / arquitectura / versión del juego -> perfil_otra_*')
  it.todo('solución con perfil de otra edición -> solucion_perfil_otra_edicion')
  it.todo('autoaprobación de un reporte (autor derivado vía equipo) -> autorrevision')
  it.todo('aprobar un perfil sin reporte funcional aprobado -> AprobacionBloqueada [perfil_sin_reporte_funcional_aprobado]')
  it.todo('aprobar una solución con fallo de origen pendiente -> AprobacionBloqueada [solucion_fallo_origen_no_aprobado]')
  it.todo('aprobar una solución que recomienda un perfil pendiente -> [solucion_perfil_no_aprobado]')
  it.todo('decidir siendo usuario -> SinPermiso; siendo revisor inactivo -> NoAutenticado')
  it.todo('rechazar algo ya aprobado -> transicion_invalida')
})

describe('la aplicación permite', () => {
  it.todo('varios diagnósticos históricos del mismo equipo')
  it.todo('el mismo payload dos veces converge en un diagnóstico (UNIQUE equipo_id, capturado_en)')
  it.todo('reporte sin perfil')
  it.todo('reporte con VersionCapaRef nueva crea la versión una sola vez')
  it.todo('decidir dos veces la misma aprobación -> { cambio: false } la segunda vez')
  it.todo('probar un perfil pendiente y luego aprobarlo con ese reporte aprobado (8.9)')
})
