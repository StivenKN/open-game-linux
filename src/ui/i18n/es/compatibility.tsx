import { count } from '../../format.ts'

const approved = (n: number) => count(n, 'reporte aprobado', 'reportes aprobados')

/** The verdict parts in `ui/compatibility/`: the game page's, and the ones the diagnosis and profile pages share. */
export const compatibility = {
  gameStatus: {
    label: 'Estado de compatibilidad',
    basis: (n: number, total: number, last: string) => (
      <>
        Según <b>{approved(n)}</b>
        {n < total && <> del último año ({total} en total)</>}. Última prueba el {last}.
      </>
    ),
    noReports: 'Todavía no hay reportes aprobados.',
    noRecent: 'Sin confirmación en el último año: todos los reportes aprobados tienen más de 12 meses.',
    /** Where the game stopped working, and the latest test there. */
    regression: (r: { launcher: string; tested: string; version: string; layer: string; outcome: string }) => (
      <>
        <b>Dejó de funcionar</b> en {r.launcher}: la prueba más reciente ({r.tested}, versión {r.version}, {r.layer}) dio «{r.outcome}» después de
        reportes que funcionaban.
      </>
    ),
    breakdown: 'Resultados aprobados',
    causes: 'Causas observadas:',
    pending: (n: number) => (n === 1 ? '1 reporte más espera revisión y todavía no cuenta.' : `${n} reportes más esperan revisión y todavía no cuentan.`),
    footnote:
      'El estado se calcula al consultar a partir de los reportes aprobados del último año, o de todos si ninguno es tan reciente. Un resultado favorable no garantiza que funcione en cualquier equipo.',
  },

  setups: {
    empty: 'Sin entornos con evidencia aprobada.',
    label: 'Entornos probados con reportes aprobados',
    yourDistro: 'tu distro',
    version: (version: string) => `versión ${version}`,
    profile: 'Perfil',
    noProfile: 'sin perfil',
    fps: 'FPS medido por la comunidad',
    notMeasured: 'no medido',
    measurements: (n: number) => count(n, 'medición', 'mediciones'),
    tests: (n: number, last: string) => `${count(n, 'prueba', 'pruebas')} · última ${last}`,
    noneRecent: 'ninguna del último año',
  },

  timeline: {
    label: 'Resultados aprobados por versión, de la primera probada a la última',
    span: (first: string, last: string) => (first === last ? `El ${first}` : `Del ${first} al ${last}`),
    regression: (launcher: string, tested: string) => (
      <>
        <b>Dejó de funcionar</b> con esta versión en {launcher}, el {tested}.
      </>
    ),
  },

  /** `ScopedStatus`'s line after the badge, when the slice has approved reports. */
  scoped: (n: number, last: string, noRecent: boolean) =>
    `${approved(n)} · última prueba ${last}${noRecent ? ' · sin confirmación en el último año' : ''}`,

  machine: {
    title: 'Tu equipo',
    shapeKey: 'Cómo leer las etiquetas',
    filled: 'Relleno: lo dicen los reportes aprobados',
    dashed: 'Punteado: lo calcula tu equipo',
    noDiagnosis:
      'Sin diagnóstico. Ejecuta el detector para ver si tu tarjeta gráfica tiene una ruta para este juego, la evidencia de tu distribución y cómo te comparas con un perfil aprobado.',
    onMyDistribution: (name: string) => `En tu distribución, ${name}:`,
    noneOnMyDistribution: (name: string) => `nadie ha aprobado una prueba en ${name}`,
  },

  checklist: {
    profile: (title: string, revision: number) => `perfil ${title} r${revision}`,
    noApprovedProfile: 'sin perfil aprobado',
    caption: 'Tu equipo frente al perfil',
    requirement: 'Dato',
    yours: 'Tu equipo',
    minimum: 'Mínimo conocido',
    result: 'Resultado',
    unknown: 'desconocido',
    noProfile: 'No hay un perfil aprobado con condiciones conocidas.',
    windows: 'Diagnóstico hecho en Windows: Vulkan es una proyección para Linux según tu tarjeta gráfica; sirve de orientación.',
    /** The sentence under the table: the first check that decides the verdict, in words. */
    reason: {
      fails: 'Tu equipo no cumple una condición del perfil.',
      missing: (requirement: string, required: string) => `${requirement}: el perfil exige ${required} y tu equipo no lo ofrece.`,
      projectedBelow: (requirement: string, value: string, required: string) =>
        `${requirement}: en Linux tu tarjeta gráfica llegaría a ${value}, el perfil exige ${required}.`,
      below: (requirement: string, value: string, required: string) => `${requirement}: tienes ${value}, el perfil exige ${required}.`,
      projectedUnknown: (requirement: string, value: string, required: string) =>
        `${requirement}: en Linux tu tarjeta gráfica llegaría a ${value}; no sabemos si alcanza ${required}.`,
      unknown: (requirement: string, required: string) => `No conocemos tu ${requirement}; el perfil exige ${required}.`,
      noConditions: 'El perfil no declara condiciones de RAM, VRAM ni Vulkan.',
      meets: (requirements: string) => `Superas las comprobaciones disponibles (${requirements}). Esto no predice FPS.`,
    },
  },

  graphicsPath: {
    caption: 'Ruta gráfica',
    launchOption: 'Opción de lanzamiento en Steam:',
    approximate: 'Calculada desde un diagnóstico de Windows: sirve de orientación.',
  },

  copyBox: {
    copy: 'Copiar',
    copied: 'Copiado',
    /** The button's accessible name, for a box captioned `label`. */
    copyLabel: (label: string) => `Copiar ${label.toLowerCase()}`,
    notice: { listo: '', copiado: 'Copiado al portapapeles.', fallo: 'No se pudo copiar. Selecciona el texto y cópialo a mano.' },
  },
}
