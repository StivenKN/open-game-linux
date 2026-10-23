import type { ReactNode } from 'react'
import type { SteamGame } from '../../../domain/steam-game.ts'
import { count } from '../../format.ts'

/** The counts the readiness headline reads from `libraryReadiness`. */
type Library = { readonly installed: number; readonly in_catalog: number; readonly working: number }

/** `n` of the `working` games: "pide…" when it is the only one, "todos piden…", or "2 de ellos piden…". */
const ofThem = (n: number, working: number, one: string, many: string): string =>
  n === working ? (n === 1 ? one : `todos ${many}`) : `${n} de ellos ${n === 1 ? one : many}`

const capitalized = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

/** The diagnosis pages (/diagnostico, its import page, a saved diagnosis) and their parts in `ui/diagnostics/`. */
export const diagnosis = {
  title: 'Diagnóstico',
  heading: 'Diagnóstico de tu equipo',
  intro:
    'Compara la RAM, la VRAM y el soporte de Vulkan de tu computador con los perfiles aprobados de cada juego. Puedes hacerlo sin cuenta: no guardamos nada hasta que pulses «Guardar en mi equipo».',
  myMachines: 'Tus equipos',
  evaluating: 'Evaluando…',

  detector: {
    heading: 'Detector automático',
    intro:
      'Un script que lee tu hardware y los juegos que tienes instalados en Steam, sin permisos de administrador. Al terminar abre esta página con el resultado en la dirección (después de «#»), que tu navegador no envía a ningún servidor.',
    powershell: 'Ejecuta en PowerShell (Windows 10 u 11, sin administrador)',
    linux: 'Ejecuta en una terminal de Linux',
    download: (file: string) => `Descargar ${file}`,
    readFirst: 'para leerlo antes de ejecutarlo con',
    pasteLabel: '¿Sin navegador en ese equipo? Pega aquí lo que imprimió el detector',
    copied: 'El detector copió el resultado al portapapeles: pégalo aquí (Ctrl+V)',
    pastePlaceholder: '{"version_esquema":1,…} o la dirección completa con #d=',
    evaluate: 'Evaluar lo pegado',
    vulkanUnknown: (
      <>
        En Linux, ¿Vulkan aparece como «Desconocido»? Instala <code>vulkan-tools</code> y vuelve a ejecutar el detector, o compruébalo a mano:
      </>
    ),
    vulkanCheck: 'Comprobación manual de Vulkan',
  },

  manual: {
    heading: 'Descripción manual',
    intro: '¿No puedes ejecutar el detector? Escribe lo que sabes de tu equipo.',
    system: 'Sistema',
    version: 'Versión',
    kernelPlaceholder: 'Kernel, p. ej. 6.8',
    device: 'Equipo',
    pc: 'PC o portátil',
    distribution: 'Distribución',
    distributionVersion: 'Versión de la distribución',
    distributionVersionPlaceholder: '21.3 o rolling',
    cpu: 'Procesador (CPU)',
    gpu: 'Tarjeta gráfica (GPU)',
    ram: 'Memoria RAM',
    vram: 'Memoria de video (VRAM)',
    dontKnow: 'No sé',
    vulkanVersion: 'Versión de Vulkan',
    onlyWithSupport: 'Solo con soporte',
    architecture: 'Arquitectura',
    x86: 'x86_64 (Intel o AMD)',
    evaluate: 'Evaluar mi equipo',
  },

  /** /diagnostico/importar: the evaluation the detector or a form sent, not saved yet. */
  import: {
    title: 'Tu diagnóstico',
    empty: 'No hay un diagnóstico para mostrar',
    emptyHelp: (diagnosis: ReactNode) => (
      <>
        Ejecuta el detector con <code>--open</code>, o pega su salida en {diagnosis}.
      </>
    ),
    reading: 'Leyendo tu equipo…',
    unreadable: 'No pudimos leer este diagnóstico',
    back: 'Volver a Diagnóstico',
    heading: 'Tu equipo frente al catálogo',
    intro: 'Esta evaluación no se ha guardado. Compara RAM, VRAM y Vulkan con el perfil aprobado sugerido para cada juego; no predice FPS.',
    /** Report mode (`--game`). */
    notInCatalog: (appId: number) =>
      `El juego ${appId} de Steam todavía no está en el catálogo, así que no hay un formulario de reporte que llenar. Puedes guardar el diagnóstico igual.`,
    report: (title: string) => `Reportar ${title}`,
    steamRead: (s: SteamGame) => {
      const tool = s.tool !== null ? `«${s.tool_version ?? s.tool}»` : s.native ? 'sin herramienta de compatibilidad (nativo)' : 'sin saber con qué herramienta'
      const options = s.launch_options === null ? '' : `, con las opciones de lanzamiento «${s.launch_options}»`
      const build = s.build_id === null ? '' : `, build ${s.build_id}`
      return `El detector leyó cómo ejecuta Steam este juego: ${tool}${options}${build}. Guarda este diagnóstico y te llevamos al formulario del reporte ya lleno. Nada se envía hasta que lo revises.`
    },
  },

  save: {
    label: 'Guardar',
    notYours: 'Ese equipo no es tuyo. Elige uno de tu lista.',
    needAccount: 'Para guardar este diagnóstico en tu equipo necesitas una cuenta.',
    needAccountToReport: 'Para reportar necesitas una cuenta. Tu diagnóstico te espera aquí al volver.',
    signInToSave: 'Entrar para guardar',
    signInToReport: 'Entrar para reportar',
    saveIn: 'Guardar en',
    newMachine: 'Un equipo nuevo…',
    newMachineName: 'Nombre del equipo nuevo',
    defaultAlias: 'Mi equipo',
    aliasPlaceholder: 'Portátil del trabajo',
    saving: 'Guardando…',
    save: 'Guardar en mi equipo',
    saveAndReport: 'Guardar y reportar',
    withLibrary: (n: number) => `Guardar también mi lista de juegos de Steam (${n}). Solo tú la ves.`,
    saved: 'Guardado.',
    alreadySaved: 'Ya estaba guardado; no se creó una copia.',
    viewSaved: 'Ver el diagnóstico guardado',
  },

  /** /diagnosticos/12. */
  saved: {
    title: 'Diagnóstico guardado',
    heading: (alias: string) => `Diagnóstico de «${alias}»`,
    private: 'Solo tú ves este diagnóstico. Los reportes que publiques mostrarán su contexto técnico, no tu correo.',
  },

  machines: { none: 'Sin diagnósticos todavía.' },

  capture: {
    label: 'Tu equipo',
    device: 'Equipo',
    system: 'Sistema',
    cpu: 'Procesador',
    noX86Level: 'Nivel x86-64 no capturado',
    gpu: 'Tarjeta gráfica',
    unknownVram: 'VRAM desconocida',
    vram: (amount: string) => `${amount} de VRAM`,
    ram: 'Memoria RAM',
    /** zram or swap at 0 MB. */
    noSwap: (name: string) => `sin ${name}`,
    driver: 'Controlador',
    unknownDriver: 'Desconocido',
    secureBoot: 'Arranque seguro',
    notCaptured: 'No capturado',
    tpmNotCaptured: 'TPM no capturado',
    captured: (when: string) => `Capturado el ${when}.`,
    guides: (link: ReactNode) => <>Para elegir una distribución, instalarla o hacer arranque dual con Windows, consulta las {link}.</>,
    guidesLink: 'guías de adopción',
  },

  graphicsCard: {
    heading: 'Tu tarjeta gráfica en Linux',
    noPci: 'Este diagnóstico no trae el identificador PCI de tu tarjeta gráfica. Vuelve a ejecutar el detector para ver qué podrá hacer en Linux.',
    unknownGpu: (pci: string) => `No reconocemos la tarjeta gráfica ${pci}, así que no podemos proyectar qué hará en Linux.`,
    generation: 'Generación',
    driver: 'Controlador en Linux',
    vulkanNo: 'sin soporte',
    vulkanYes: 'compatible',
    d3d9to11: 'DirectX 9 a 11',
    d3d12Yes: 'Sí, con VKD3D-Proton',
    d3d12No: 'No',
    d3d12Needs: 'Necesita Vulkan 1.3',
    launchOption: 'Opción de lanzamiento en Steam',
    projected: 'Proyección a partir del modelo de tu GPU, no una medición.',
  },

  matrix: { label: 'Juegos frente a tu equipo' },

  games: {
    heading: 'Juegos',
    library: 'Tu biblioteca de Steam',
    unknown: (n: number) => `Juegos que todavía no conocemos (${n})`,
    unknownHelp: 'Aún no están en el catálogo, así que no sabemos cómo funcionan en Linux. Cada nombre abre su página en Steam.',
    rest: 'Resto del catálogo',
  },

  /** The top of "Tu biblioteca de Steam": the one-screen answer to "can I switch to Linux?". */
  readiness: {
    label: 'Resumen de tu biblioteca',
    /** Evidence only: the machine never changes this count, the sentences after it qualify it. */
    headline: ({ installed, in_catalog, working }: Library): string => {
      if (installed === 0) return 'El detector no encontró juegos de Steam instalados.'
      const one = installed === 1
      if (in_catalog === 0) return one ? 'Tu juego todavía no está en el catálogo.' : `Ninguno de tus ${installed} juegos está todavía en el catálogo.`
      if (working === 0)
        return one ? 'Tu juego todavía no tiene evidencia de que funcione en Linux.' : `Ninguno de tus ${installed} juegos tiene todavía evidencia de que funcione en Linux.`
      const subject = working === installed ? (one ? 'Tu juego' : `Tus ${installed} juegos`) : `${working} de ${one ? 'tu juego' : `tus ${installed} juegos`}`
      return `${subject} ${working === 1 ? 'tiene evidencia de que funciona' : 'tienen evidencia de que funcionan'} en Linux.`
    },
    /** Of the `working` games, `n` ask more than the machine has. */
    outOfReach: (n: number, working: number) => `Pero ${ofThem(n, working, 'pide', 'piden')} más de lo que tiene tu equipo.`,
    /** Of the `working` games, `n` only have evidence older than a year. */
    stale: (n: number, working: number) => `${capitalized(ofThem(n, working, 'solo tiene', 'solo tienen'))} reportes aprobados de hace más de un año.`,
    installed: (installed: number, inCatalog: number, unknown: number) =>
      `${count(installed, 'juego instalado', 'juegos instalados')}: ${inCatalog} en el catálogo${unknown > 0 ? ` y ${unknown} que todavía no conocemos` : ''}.`,
    byStatus: 'Tus juegos del catálogo, por estado',
    blocked: (n: number): string => (n === 1 ? '1 de ellos está bloqueado por un anti-cheat.' : `${n} de ellos están bloqueados por un anti-cheat.`),
    holdingBack: 'Te frenan',
    noneHoldingBack: 'Ninguno por ahora.',
    stoppedWorking: 'Dejó de funcionar',
    outOfReachChip: 'Tu equipo no cumple',
    noEvidence: 'Sin evidencia',
    noEvidenceHelp: 'Nadie ha aprobado todavía una prueba de estos juegos. Si ya jugaste alguno en Linux, repórtalo.',
    report: 'Reportar un resultado',
    more: (n: number) => `Y ${count(n, 'juego más', 'juegos más')} en la lista de abajo.`,
    footnote: 'Solo cuentan los reportes aprobados, igual que en la ficha de cada juego. Un resultado favorable no garantiza que funcione en tu equipo.',
  },

  distributions: {
    heading: 'Distribuciones',
    intro: (guide: ReactNode) => (
      <>
        No elegimos una por ti. Descartamos las que tu equipo no puede usar y decimos qué ajuste necesita cada una; «sin objeciones» significa que no encontramos
        nada en contra. Para decidir entre ellas, lee {guide}.
      </>
    ),
    guides: 'las guías de adopción',
    guide: '¿Qué distribución elegir para jugar?',
  },
}
