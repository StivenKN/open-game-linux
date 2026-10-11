// 8.11 "El esquema debe rechazar ...": one case per item, asserted by constraint NAME, so a test
// cannot pass because some other rule fired. Plus the 3 immutability triggers and the round 1 fix
// (approval with blank evidence). Fixtures come from tests/fixtures.ts (minimal valid rows).
import { describe, it } from '@effect/vitest'

describe('el esquema rechaza', () => {
  // Each `it.effect` body: insert the minimal valid parents, run the offending statement,
  // Effect.flip it, expect restriccionViolada(e) to equal the name below. All inside enRollback.
  const casos: ReadonlyArray<readonly [string, string]> = [
    ['dependencia duplicada en un perfil', 'perfil_dependencia_pkey'],
    ['fallo duplicado en un reporte', 'reporte_fallo_pkey'],
    ['FK inexistente (reporte.edicion_id = 999999)', 'reporte_edicion_id_fkey'],
    ['estado inválido (estado_revision = borrador)', 'reporte_estado_revision_dominio'],
    ['resultado inválido', 'reporte_resultado_dominio'],
    ['RAM negativa o cero', 'diagnostico_ram_positiva'],
    ['VRAM negativa', 'diagnostico_vram_no_negativa'],
    ['FPS negativo', 'reporte_fps_no_negativo'],
    ['FPS sin resolución/calidad/método', 'reporte_fps_con_contexto'],
    ['aprobación sin evidencia (NULL)', 'reporte_bloque_revision'],
    ['aprobación con evidencia en blanco ("   ")', 'reporte_bloque_revision'],
    ['rechazo sin motivo', 'solucion_bloque_revision'],
    ['revisión anterior a la creación', 'perfil_configuracion_revision_posterior'],
    ['autoaprobación de un perfil', 'perfil_configuracion_sin_autoaprobacion'],
    ['reporte con perfil de otra edición', 'reporte_perfil_fk'],
    ['solución sobre un fallo que el reporte no tiene', 'solucion_fallo_fk'],
    ['Linux sin distribución', 'diagnostico_linux_con_distribucion'],
    ['texto obligatorio en blanco (juego.titulo = "  ")', 'juego_titulo_no_vacio'],
    ['versión de capa "última"', 'version_capa_version_exacta'],
    ['actualizar un diagnóstico', 'og_inmutable'],
    ['cambiar el dueño de un equipo', 'og_inmutable'],
    ['reescribir el título de un reporte aprobado', 'og_solo_revision'],
    ['agregar un paso a un perfil usado por un reporte', 'og_perfil_congelado'],
    ['rol fuera del dominio', 'usuario_rol_dominio'],
  ]
  for (const [caso, restriccion] of casos) it.todo(`${caso} -> ${restriccion}`)

  it.todo('every key of reglaDeRestriccion exists (pg_constraint.conname or a RAISE ... CONSTRAINT name)')
  it.todo('getMigrations(auth.options) has nothing to create or add after migrating (auth SQL and config agree)')
})

describe('el esquema permite', () => {
  it.todo('reporte sin perfil (MATCH SIMPLE skips reporte_perfil_fk)')
  it.todo('guía general (guia_adopcion.distribucion_id NULL)')
  it.todo('dos ediciones con identificador_externo NULL en el mismo lanzador')
  it.todo('retirar un reporte aprobado conservando su evidencia')
})
