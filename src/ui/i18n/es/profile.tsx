/** A configuration profile's page (`/perfiles/3`), proposing and editing one, and sharing it with umu-protonfixes. */
export const profile = {
  // Words the page and the form share.
  breadcrumb: 'Perfil',
  editProposal: 'Editar la propuesta',
  newVersion: 'Proponer una versión con cambios',
  steps: 'Pasos',
  dependencies: 'Dependencias',
  requirements: 'Condiciones conocidas',
  ramMin: 'RAM mínima',
  vramMin: 'VRAM mínima',

  page: {
    catalog: 'Catálogo',
    testing: 'en prueba',
    approvedOn: (date: string) => `Aprobado el ${date}`,
    author: (name: string) => `autor ${name}`,
    gameVersion: (version: string) => `versión del juego ${version}`,
    unapproved:
      'Este perfil aún no está aprobado: lo escribió un usuario y ningún revisor ha leído sus pasos. Lee cada comando antes de ejecutarlo. Si lo pruebas, un reporte aprobado con resultado funcional es lo que su aprobación necesita.',
    nothingRuns: 'OpenGame no descarga ni ejecuta nada. Sigue los pasos tú mismo; los comandos se copian tal cual.',
    yours: 'Es tu propuesta. Puedes editarla o eliminarla mientras nadie la use en un reporte o una solución.',
    report: 'Reportar resultado con este perfil',
    noSteps: 'Este perfil no tiene pasos.',
    launchOptions: 'Parámetros de lanzamiento',
    noDependencies: 'No necesita dependencias adicionales.',
    required: 'obligatoria',
    optional: 'opcional',
    version: (version: string) => `versión ${version}`,
    install: (name: string) => `Instalar ${name}`,
    requirementsCaption: 'Condiciones conocidas del perfil',
    undeclared: 'no declarada',
    vulkanRequired: (min: string | null) => `obligatorio${min ? `, ${min} o superior` : ''}`,
    vulkanNotNeeded: 'no lo necesita',
    /** Why the page has no comparison with the visitor's machine. */
    noEvaluation: {
      perfil_en_prueba: 'Tu equipo se compara solo con perfiles aprobados.',
      sin_diagnostico: 'Sin diagnóstico. Ejecuta el detector para comparar tu RAM, VRAM y Vulkan con este perfil.',
    },
    progress: (done: number, total: number) => `${done} de ${total} pasos hechos · se guarda solo en este navegador`,
    reset: 'Reiniciar',
    done: 'Hecho',
  },

  propose: {
    title: (game: string | null) => `Proponer un perfil para ${game ?? 'un juego'}`,
    caption: 'Proponer un perfil',
    intro:
      'Un perfil son los pasos para que el juego funcione en un entorno concreto. Queda pendiente hasta que un revisor lo apruebe con un reporte funcional que lo use. Mientras nadie lo use, puedes editarlo o eliminarlo.',
    startingFrom: (title: string) => `Empiezas con los datos de «${title}». Lo que envíes es un perfil nuevo; el original no cambia.`,
    setup: 'Para qué entorno',
    setupHelp: 'Un reporte solo puede usar el perfil si coincide con su edición, su distribución, su arquitectura y su capa.',
    edition: 'Edición (lanzador)',
    distribution: 'Distribución',
    architecture: { label: 'Arquitectura', help: 'La que muestra uname -m: x86_64 en casi todos los PC.' },
    layer: {
      legend: 'Capa de compatibilidad',
      listed: 'Una versión de la lista',
      other: 'Otra versión',
      version: 'Versión',
      family: 'Familia',
      variant: 'Variante',
      exactVersion: 'Versión exacta',
    },
    sending: 'Enviando…',
    submit: 'Proponer el perfil',
    back: 'Volver a la ficha',
  },

  edit: {
    title: 'Editar el perfil',
    breadcrumb: 'Editar',
    setupStays: 'El entorno queda como lo propusiste. Si te equivocaste de entorno, elimina la propuesta y propón otra.',
    saving: 'Guardando…',
    save: 'Guardar los cambios',
    cancel: 'Cancelar',
    frozen: 'Alguien ya usó este perfil en un reporte o una solución, o un revisor ya lo revisó, así que no cambia.',
    delete: {
      heading: 'Eliminar la propuesta',
      note: 'Se borra con sus pasos y dependencias. No se puede deshacer.',
      confirm: 'Sí, eliminarla',
      keep: 'No',
    },
  },

  /** The fields a profile's author fills in, on the propose and edit pages. */
  form: {
    title: { label: 'Título', help: 'Qué logra el perfil, por ejemplo «GTA V en gráficos bajos con Proton 8».' },
    gameVersion: {
      label: 'Versión del juego (opcional)',
      help: 'Solo si el perfil sirve para una versión concreta: un reporte con otra versión no podrá usarlo.',
    },
    launchOptions: { label: 'Parámetros de lanzamiento (opcional)', help: 'Quien siga el perfil los copia tal cual en su lanzador.' },
    requirementsHelp: 'La página del perfil compara la RAM, la VRAM y Vulkan con el diagnóstico de quien la abre. Lo que no declares no se compara.',
    undeclared: 'Sin declarar',
    vulkanRequired: 'Obligatorio',
    vulkanNotNeeded: 'No lo necesita',
    vulkanMin: 'Versión mínima de Vulkan',
    anyVersion: 'Cualquiera',
    freeText: 'Texto libre: se muestra, no se compara.',
    cpu: { label: 'CPU (opcional)', example: '4 núcleos con AVX' },
    gpu: { label: 'GPU (opcional)', example: 'GTX 1050 o equivalente' },
    steps: {
      help: 'En el orden en que se siguen. Escribe los comandos tal cual: la página los muestra para copiarlos.',
      step: (n: number) => `Paso ${n}`,
      up: 'Subir',
      down: 'Bajar',
      remove: 'Quitar',
      title: 'Título',
      instruction: 'Qué hacer',
      add: 'Añadir un paso',
    },
    dependencies: {
      help: 'Bibliotecas o programas que el juego necesita además de la capa, con el comando para instalarlos.',
      add: 'Añadir una dependencia',
      listed: 'Una de la lista',
      other: 'Otra',
      remove: 'Quitar',
      dependency: 'Dependencia',
      name: 'Nombre',
      packageManager: 'Gestor',
      description: { label: 'Qué es', example: 'Bibliotecas de Visual C++ 2019' },
      version: 'Versión (opcional)',
      required: 'Obligatoria',
      install: 'Cómo instalarla',
    },
  },

  /** "Compartir con umu-protonfixes" on an approved profile. The fix file and the PR it proposes stay in English, for the project. */
  upstream: {
    heading: 'Compartir con umu-protonfixes',
    nothing: 'Este perfil no tiene opciones de lanzamiento ni dependencias que se conviertan en un arreglo de umu-protonfixes.',
    nothingTranslates: 'Nada de este perfil se convierte en un arreglo de umu-protonfixes:',
    file: (path: string) => (
      <>
        umu-protonfixes aplica arreglos por juego cuando lo abres con GE-Proton o umu. Este perfil se traduce en el archivo <code>{path}</code>; puedes
        usarlo hoy mismo y proponerlo al proyecto para que llegue a todos.
      </>
    ),
    useNow: 'Úsalo ya en tu PC',
    onlyGe: 'Solo GE-Proton y umu leen esta carpeta; el Proton de Valve no.',
    fileCopy: (path: string) => `Archivo ${path}`,
    skipped: 'No pasó al archivo:',
    existing: '¿Ya existe un arreglo? Revísalo primero',
    propose: 'Proponerlo en GitHub',
    demo: 'Los datos de ejemplo no se envían a umu-protonfixes.',
    accepted: (pr: number) => `Aceptado en umu-protonfixes · PR #${pr}`,
    notedOn: (date: string) => `registrado el ${date}`,
    note: {
      label: 'Registrar un PR fusionado (revisores)',
      help: 'Solo PR ya fusionados: cada uno suma al contador público.',
      search: 'Buscar PR fusionados de OpenGame',
      sending: 'Registrando…',
      submit: 'Registrar PR aceptado',
    },
    retract: 'Anular',
  },
}
