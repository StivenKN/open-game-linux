// Field labels the detector's note names, so the note and the form say the same.
const gameVersion = 'Versión o build del juego'
const observations = 'Observaciones'

/** The report form (`/juegos/12/reportar`), proposing a solution to one of its failures, and preparing a report for Valve. */
export const report = {
  backToGame: 'Volver a la ficha del juego',
  sending: 'Enviando…',

  form: {
    title: (game: string | null) => `Reportar ${game ?? 'resultado'}`,
    caption: 'Reportar resultado',
    sent: {
      heading: 'Reporte enviado',
      pending: (
        <>
          Queda <strong>pendiente de revisión</strong> y no cuenta en el resumen del juego hasta que un revisor lo apruebe.
        </>
      ),
      proposeSolution: '¿Conoces una solución? Propónla',
      valveReport: 'Prepara el informe para Valve',
      another: 'Reportar otro resultado',
    },
    needsDiagnosis: 'Para reportar necesitas un diagnóstico de tu equipo hecho en Linux: el reporte guarda el entorno exacto de la prueba.',
    makeDiagnosis: 'Hacer un diagnóstico',
    /** Stands in for a mismatch's side the page has no name for. */
    other: { layer: 'otra capa', edition: 'otra edición', distribution: 'otra distribución' },

    where: 'Dónde probaste',
    diagnostic: { label: 'Diagnóstico del equipo', help: 'Solo aparecen tus diagnósticos hechos en Linux.' },
    edition: 'Edición (lanzador)',
    layer: {
      legend: 'Capa de compatibilidad usada',
      listed: 'Una versión de la lista',
      other: 'Otra versión',
      version: 'Versión',
      family: 'Familia',
      variant: 'Variante',
      exactVersion: 'Versión exacta',
    },
    gameVersion,
    launcherVersion: 'Versión del lanzador (opcional)',
    profile: {
      label: 'Perfil que seguiste',
      help: 'Solo aparecen los perfiles que coinciden con tu diagnóstico, la edición, la capa y la versión del juego.',
      none: 'Sin perfil',
    },

    what: 'Qué pasó',
    testedAt: 'Fecha y hora de la prueba',
    outcome: 'Resultado',
    failures: {
      legend: 'Fallos observados',
      required: 'Indica al menos un tipo de fallo. Si no sabes la causa, elige «Otro» y describe el síntoma.',
      optional: 'Opcional: anota cualquier problema aunque el juego funcione.',
      type: 'Tipo',
      detail: 'Qué viste',
      remove: 'Quitar',
      add: 'Añadir un fallo',
    },
    measurement: {
      label: 'Medí los FPS',
      note: 'Sin medición el reporte no guarda FPS; nunca se convierte en cero.',
      avgFps: 'FPS promedio',
      resolution: 'Resolución',
      quality: 'Calidad gráfica',
      qualityExample: 'Medio',
      method: 'Cómo mediste',
      methodExample: 'MangoHud · escena · duración',
    },
    observations: {
      label: observations,
      help: 'Resultado, limitaciones y cualquier ajuste extra que hiciste fuera del perfil.',
      /** The launch options report mode read from Steam, written into the observations for the user to keep or edit. */
      launchOptions: (options: string) => `Opciones de lanzamiento: ${options}\n`,
    },
    submit: 'Enviar reporte',
  },

  /** What report mode filled in from the detector. */
  detected: {
    label: 'Lo que leyó el detector',
    intro: (
      <>
        <b>Lo llenamos con lo que leyó el detector en tu equipo.</b> Revisa cada campo antes de enviar.
      </>
    ),
    layer: (note: string) => `Capa: ${note}`,
    tool: (tool: string, version: string | null) => (version === null ? `«${tool}»` : `«${tool}» (${version})`),
    native: 'Steam lo ejecuta sin herramienta de compatibilidad, como juego nativo. Elige la versión nativa de la lista o escríbela.',
    unknownTool: 'El detector no pudo saber con qué la ejecuta Steam. Elígela tú.',
    untranslatable: (tool: string) => `Steam usa ${tool}, que no sabemos traducir a una capa. Elígela tú.`,
    listed: (tool: string) => `Steam usa ${tool}; la elegimos en la lista.`,
    noVersion: (tool: string) => `Steam usa ${tool} sin decir la versión exacta. Escríbela como aparece en Steam, en Propiedades > Compatibilidad.`,
    unlisted: (tool: string) => `Steam usa ${tool}, que todavía no está en la lista; la dejamos escrita como otra versión.`,
    build: (build: string) => `Build ${build}, en «${gameVersion}».`,
    launchOptions: `Opciones de lanzamiento: en «${observations}», porque el reporte no tiene un campo para ellas.`,
    guessedAccount: ' Hay varias cuentas de Steam en ese equipo y ninguna figura como la última usada: son las de la primera.',
    testedAt: 'Fecha y hora: la del diagnóstico, porque un reporte no puede ser anterior a él.',
  },

  solution: {
    title: (game: string) => `Proponer solución · ${game}`,
    caption: 'Proponer solución',
    gameVersion: (version: string) => `versión ${version}`,
    sent: {
      heading: 'Solución enviada',
      pending: (
        <>
          Queda <strong>pendiente de revisión</strong>. Para publicarla, un revisor necesita evidencia de que resuelve el fallo, no solo que el fallo existe.
        </>
      ),
    },
    failure: 'Fallo que resuelve',
    profile: {
      label: 'Perfil que recomiendas (opcional)',
      help: 'Solo perfiles de la misma edición. Si recomiendas uno pendiente, la solución no se aprueba hasta que el perfil lo esté.',
      none: 'Ninguno: describo otra acción',
    },
    solutionTitle: { label: 'Título', example: 'Reinstalar el lanzador dentro del prefijo' },
    instructions: { label: 'Instrucciones', help: 'Pasos concretos para resolver el fallo o aplicar la alternativa.' },
    submit: 'Enviar solución',
  },

  /** The steps to file a report on Valve's Proton tracker. The report's own title and body are in English, for Valve. */
  proton: {
    title: (game: string) => `Informe para Valve · ${game}`,
    caption: 'Informe para Valve',
    private: 'Solo tú ves esta página: el informe lleva tu GPU, tu controlador y tu kernel. OpenGame no lo envía; lo abres tú en GitHub.',
    intro: 'Valve corrige Proton a partir de informes en su repositorio de GitHub. Este ya lleva tu equipo y lo que viste; solo falta el registro de Proton.',
    log: {
      heading: 'Activa el registro de Proton',
      body: 'En Steam, clic derecho sobre el juego > Propiedades > General. Pon esto en «Opciones de lanzamiento» y juega hasta que aparezca el fallo. Si ya tenías opciones, añade PROTON_LOG=1 al principio y deja %command% una sola vez.',
      copy: 'Opciones de lanzamiento',
    },
    compress: {
      heading: 'Comprime el registro',
      body: 'Proton lo deja en tu carpeta personal. Comprimido pesa mucho menos y GitHub lo acepta como adjunto.',
      copy: 'Comprimir el registro',
    },
    search: {
      heading: 'Busca si ya hay un informe',
      body: (appid: string) =>
        `Valve quiere un informe por juego. Si ya existe uno con el AppID ${appid}, comenta allí con el texto de abajo y el registro en lugar de abrir otro.`,
      link: (appid: string) => `Buscar informes del AppID ${appid}`,
    },
    open: {
      heading: 'Abre el informe',
      body: (appid: string) => `Arrastra steam-${appid}.log.gz al informe y marca las casillas «I confirm» solo si son ciertas.`,
      link: 'Abrir el informe en GitHub',
      demo: 'Los datos de ejemplo no se envían a Valve.',
      bodyInLink: 'Si el formulario no trae el informe, reemplaza su texto con este.',
      tooLong: 'El informe es demasiado largo para el enlace: pega este texto en el formulario.',
      copy: (title: string) => `Informe: ${title}`,
    },
  },
}
