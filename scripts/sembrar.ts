import { Effect, Option, Record, Schema } from 'effect'
import { SqlClient } from 'effect/sql'
import { SaveDiagnostic, NewSolution, NewReport } from '../src/domain/contributions.ts'
import { STEAM_LAUNCHER } from '../src/domain/library.ts'
import type { GuideType } from '../src/domain/guides.ts'
import { UserId } from '../src/domain/ids.ts'
import { type GraphicsApi, requiresFailure, type LayerFamily, type Outcome } from '../src/domain/literals.ts'
import type { X86Level } from '../src/domain/platform.ts'
import { ContributionRef, Decision, type Role } from '../src/domain/review.ts'
import { submitReport, submitSolution } from '../src/server/commands/contributions.ts'
import { submitDiagnostic } from '../src/server/commands/diagnostic.ts'
import { SCHEMA_VERSION } from '../src/server/diagnostics/payload.ts'
import { decide } from '../src/server/commands/review.ts'
import { assignRole, auth, demoDomain, Visitor } from '../src/server/auth.ts'
import { rows, oneRow } from '../src/server/rows.ts'
import { PgLive } from '../src/server/runtime.ts'

const contrasenaDemo = 'opengame-demo'

const cuentas = {
  demo_revisor: 'revisor',
  demo_admin: 'administrador',
  demo_ana: 'usuario',
  demo_bruno: 'usuario',
} as const satisfies Record<string, Role>
type Cuenta = keyof typeof cuentas
const correoDe = (alias: Cuenta) => `${alias}@${demoDomain}`

const launchers = {
  steam: { name: STEAM_LAUNCHER, official_url: 'https://store.steampowered.com' },
  epic: { name: 'Epic Games Store', official_url: 'https://store.epicgames.com' },
  gog: { name: 'GOG', official_url: 'https://www.gog.com' },
  riot: { name: 'Riot Client', official_url: 'https://www.riotgames.com' },
} as const

const distribuciones = {
  mint: { name: 'Linux Mint', version: '21.3', official_url: 'https://linuxmint.com' },
  ubuntu: { name: 'Ubuntu', version: '24.04', official_url: 'https://ubuntu.com' },
  fedora: { name: 'Fedora', version: '40', official_url: 'https://fedoraproject.org' },
  arch: { name: 'Arch Linux', version: 'rolling', official_url: 'https://archlinux.org' },
  pop: { name: 'Pop!_OS', version: '22.04', official_url: 'https://pop.system76.com' },
} as const

const capas = {
  proton8: { family: 'Proton', variant: 'Valve', version: '8.0-5' },
  proton9: { family: 'Proton', variant: 'Valve', version: '9.0-3' },
  ge94: { family: 'Proton', variant: 'GE', version: '9-4' },
  wine9: { family: 'Wine', variant: 'estable', version: '9.0' },
  nativo: { family: 'Nativo', variant: 'Steam Linux Runtime', version: '3.0' },
} as const satisfies Record<string, { family: LayerFamily; variant: string; version: string }>

const tiposFallo = {
  anti_cheat: 'El sistema anti-trampas del juego bloquea Linux o la capa de compatibilidad.',
  drm: 'La protección anticopia impide iniciar el juego.',
  lanzador: 'El lanzador del editor no abre, no inicia sesión o no termina de actualizar.',
  controlador: 'Falta un controlador de video o su versión no es compatible.',
  dependencia: 'Falta una biblioteca o componente que el juego necesita.',
  rendimiento: 'El juego corre, pero con caídas de FPS o tirones que lo hacen injugable.',
  otro: 'Causa no identificada.',
}

const dependencias = {
  vcrun2019: { name: 'vcrun2019', package_manager: 'winetricks', description: 'Bibliotecas de Visual C++ 2015-2019 para juegos de Windows.' },
  d3dcompiler_47: { name: 'd3dcompiler_47', package_manager: 'winetricks', description: 'Compilador de sombreadores de DirectX que algunos juegos esperan encontrar.' },
  gamemode: { name: 'gamemode', package_manager: 'apt', description: 'Demonio de Feral que ajusta la CPU y el planificador mientras juegas.' },
  mangohud: { name: 'mangohud', package_manager: 'apt', description: 'Superposición que muestra FPS, temperaturas y uso de GPU.' },
} as const

const juegos = {
  gta5: {
    title: 'Grand Theft Auto V',
    description: 'Mundo abierto de acción en Los Santos, con historia para un jugador y GTA Online.',
    ediciones: { steam: '271590', epic: null },
    apis: ['d3d10', 'd3d11', 'd3d12'],
    x86_level_min: null,
  },
  valorant: {
    title: 'Valorant',
    description: 'Shooter táctico competitivo de Riot Games, cinco contra cinco.',
    ediciones: { riot: null },
    apis: ['d3d11'],
    x86_level_min: null,
  },
  ets2: {
    title: 'Euro Truck Simulator 2',
    description: 'Simulador de camiones por las carreteras de Europa. Tiene versión nativa para Linux.',
    ediciones: { steam: '227300' },
    apis: ['d3d11', 'opengl'],
    x86_level_min: null,
  },
  eldenRing: {
    title: 'Elden Ring',
    description: 'Rol de acción en mundo abierto de FromSoftware.',
    ediciones: { steam: '1245620' },
    apis: ['d3d12'],
    x86_level_min: null,
  },
  witcher3: {
    title: 'The Witcher 3: Wild Hunt',
    description: 'Rol de mundo abierto de CD Projekt RED protagonizado por Geralt de Rivia.',
    ediciones: { steam: '292030', gog: null },
    apis: ['d3d11', 'd3d12'],
    x86_level_min: null,
  },
  cs2: {
    title: 'Counter-Strike 2',
    description: 'Shooter táctico competitivo de Valve. Tiene versión nativa para Linux.',
    ediciones: { steam: '730' },
    apis: ['vulkan', 'd3d11'],
    x86_level_min: 'v2', // Source 2 needs SSE4.2
  },
} as const satisfies Record<
  string,
  {
    title: string
    description: string
    ediciones: Partial<Record<keyof typeof launchers, string | null>>
    apis: ReadonlyArray<GraphicsApi>
    x86_level_min: X86Level | null
  }
>

type Edicion = { [J in keyof typeof juegos]: readonly [J, keyof (typeof juegos)[J]['ediciones']] }[keyof typeof juegos]

type Perfil = {
  edicion: Edicion
  distribution: keyof typeof distribuciones
  layer: keyof typeof capas
  author: Cuenta
  title: string
  ram_min_mb: number | null
  vram_min_mb: number | null
  requires_vulkan: boolean | null
  vulkan_version_min: string | null
  launch_options: string | null
  steps: ReadonlyArray<readonly [titulo: string, instruccion: string]>
  dependencias: ReadonlyArray<{ dependency: keyof typeof dependencias; required: boolean; install_instruction: string }>
}

const steamPlay = [
  'Activa Steam Play',
  'En Steam, abre Steam > Configuración > Compatibilidad y activa «Habilitar Steam Play para todos los demás títulos». Reinicia Steam.',
] as const
const elegirCapa = (layer: string) =>
  [
    `Elige ${layer}`,
    `En la biblioteca, clic derecho sobre el juego > Propiedades > Compatibilidad. Marca «Forzar el uso de una herramienta de compatibilidad» y elige ${layer}.`,
  ] as const
const parametros = [
  'Copia los parámetros de lanzamiento',
  'En Propiedades > General, pega los parámetros de este perfil en «Opciones de lanzamiento». Se copian tal cual; OpenGame nunca los ejecuta por ti.',
] as const

const perfiles: ReadonlyArray<Perfil> = [
  {
    edicion: ['gta5', 'steam'],
    distribution: 'mint',
    layer: 'proton8',
    author: 'demo_ana',
    title: 'GTA V en gráficos bajos con Proton 8',
    ram_min_mb: 8192,
    vram_min_mb: 2048,
    requires_vulkan: true,
    vulkan_version_min: '1.1',
    launch_options: 'gamemoderun %command%',
    steps: [
      steamPlay,
      elegirCapa('Proton 8.0-5'),
      parametros,
      ['Deja terminar el Rockstar Games Launcher', 'La primera vez el lanzador de Rockstar se instala y se actualiza solo. Espera a que abra el juego antes de cambiar nada.'],
      ['Ajusta los gráficos', 'En el juego, Configuración > Gráficos: calidad de texturas «Normal» y sin MSAA.'],
    ],
    dependencias: [{ dependency: 'gamemode', required: false, install_instruction: 'sudo apt install gamemode' }],
  },
  {
    edicion: ['eldenRing', 'steam'],
    distribution: 'ubuntu',
    layer: 'proton9',
    author: 'demo_bruno',
    title: 'Elden Ring base con Proton 9',
    ram_min_mb: 12288,
    vram_min_mb: 4096,
    requires_vulkan: true,
    vulkan_version_min: '1.3',
    launch_options: null,
    steps: [steamPlay, elegirCapa('Proton 9.0-3'), ['Primera ejecución', 'La primera partida compila sombreadores y puede ir a tirones unos minutos. Es normal.']],
    dependencias: [],
  },
  {
    edicion: ['witcher3', 'gog'],
    distribution: 'fedora',
    layer: 'ge94',
    author: 'demo_ana',
    title: 'The Witcher 3 de GOG con Heroic y GE-Proton',
    ram_min_mb: 8192,
    vram_min_mb: 2048,
    requires_vulkan: true,
    vulkan_version_min: '1.1',
    launch_options: null,
    steps: [
      ['Instala Heroic Games Launcher', 'Instálalo desde Flathub (flatpak install flathub com.heroicgameslauncher.hgl) y entra con tu cuenta de GOG.'],
      ['Descarga GE-Proton 9-4', 'En Heroic, Administrador de Wine > GE-Proton, descarga la versión 9-4.'],
      ['Configura el juego', 'En la configuración del juego en Heroic, elige GE-Proton 9-4 como versión de Wine.'],
    ],
    dependencias: [
      { dependency: 'vcrun2019', required: true, install_instruction: 'En Heroic, configuración del juego > Winetricks, instala vcrun2019.' },
    ],
  },
  {
    edicion: ['ets2', 'steam'],
    distribution: 'mint',
    layer: 'nativo',
    author: 'demo_bruno',
    title: 'ETS2 nativo en Linux Mint',
    ram_min_mb: 4096,
    vram_min_mb: null,
    requires_vulkan: null,
    vulkan_version_min: null,
    launch_options: null,
    steps: [['Instala la versión nativa', 'No fuerces ninguna herramienta de compatibilidad: Steam descarga la versión para Linux.']],
    dependencias: [],
  },
  {
    edicion: ['cs2', 'steam'],
    distribution: 'arch',
    layer: 'nativo',
    author: 'demo_ana',
    title: 'CS2 nativo con Vulkan',
    ram_min_mb: 8192,
    vram_min_mb: 1024,
    requires_vulkan: true,
    vulkan_version_min: '1.2',
    launch_options: null,
    steps: [
      ['Instala la versión nativa', 'No fuerces ninguna herramienta de compatibilidad: CS2 usa Vulkan de forma nativa.'],
      ['Comprueba Vulkan', 'Ejecuta vulkaninfo --summary y confirma que aparece tu GPU.'],
    ],
    dependencias: [{ dependency: 'mangohud', required: false, install_instruction: 'Instala mangohud con el gestor de tu distribución (en Arch: sudo pacman -S mangohud).' }],
  },
  // The one demo profile with something to translate into a umu-protonfixes file (and two things that do not).
  {
    edicion: ['witcher3', 'steam'],
    distribution: 'fedora',
    layer: 'proton9',
    author: 'demo_bruno',
    title: 'The Witcher 3 de Steam sin lanzador con Proton 9',
    ram_min_mb: 8192,
    vram_min_mb: 2048,
    requires_vulkan: true,
    vulkan_version_min: '1.1',
    launch_options: 'DXVK_FRAME_RATE=60 gamemoderun %command% --launcher-skip',
    steps: [steamPlay, elegirCapa('Proton 9.0-3'), parametros],
    dependencias: [
      { dependency: 'd3dcompiler_47', required: true, install_instruction: 'protontricks 292030 d3dcompiler_47' },
      { dependency: 'gamemode', required: false, install_instruction: 'sudo dnf install gamemode' },
    ],
  },
]

const guias: ReadonlyArray<{ type: GuideType; distribution: keyof typeof distribuciones | null; title: string; content: string }> = [
  {
    type: 'eleccion_distribucion',
    distribution: null,
    title: '¿Qué distribución elegir para jugar?',
    content: [
      'Si vienes de Windows, empieza por una distribución con escritorio familiar y controladores fáciles de instalar.',
      'Linux Mint 21.3 se parece a Windows y es estable. Ubuntu 24.04 tiene la comunidad más grande. Pop!_OS 22.04 ofrece una imagen con el controlador de NVIDIA ya incluido. Fedora 40 trae software más reciente. Arch Linux es para quien quiere armar su sistema pieza por pieza.',
      'Antes de decidir, revisa en OpenGame qué juegos tuyos tienen reportes aprobados en cada distribución.',
    ].join('\n\n'),
  },
  {
    type: 'instalacion',
    distribution: 'mint',
    title: 'Instalar Linux Mint 21.3 para jugar',
    content: [
      '1. Descarga la imagen ISO desde linuxmint.com y grábala en una memoria USB con balenaEtcher o Ventoy.',
      '2. Arranca desde la memoria y elige «Instalar Linux Mint». Marca la casilla de códecs multimedia.',
      '3. Al terminar, abre el Gestor de controladores e instala el controlador recomendado para tu GPU.',
      '4. Instala Steam desde el Gestor de software y activa Steam Play.',
    ].join('\n'),
  },
  {
    type: 'arranque_dual',
    distribution: 'ubuntu',
    title: 'Arranque dual Windows y Ubuntu 24.04',
    content: [
      'Haz una copia de seguridad antes de tocar particiones.',
      '1. En Windows, desactiva el inicio rápido y reduce la partición de Windows desde Administración de discos.',
      '2. Arranca el instalador de Ubuntu y elige «Instalar junto a Windows».',
      '3. Al reiniciar, GRUB te deja elegir el sistema. Si Windows no aparece, ejecuta sudo update-grub.',
    ].join('\n'),
  },
]

type Valor = string | number | boolean | null

const clavePerfil = (p: Pick<Perfil, 'edicion' | 'distribution' | 'layer'>) => `${p.edicion.join('/')}|${p.distribution}|${p.layer}`

const equipos = {
  anaPortatil: {
    dueno: 'demo_ana',
    alias: 'Portátil de Ana',
    distribution: 'mint',
    diagnostic: {
      capturado_en: '2026-07-01T18:00:00Z',
      version_sistema: '6.8.0-45-generic',
      cpu_modelo: 'AMD Ryzen 5 5600H',
      gpu_modelo: 'NVIDIA GeForce RTX 3050 Laptop GPU',
      ram_mb: 16384,
      vram_mb: 4096,
      controlador: 'nvidia',
      version_controlador: '550.107.02',
      gpu_pci_id: '10de:25a2',
      version_vulkan: '1.3.280',
    },
  },
  anaTorre: {
    dueno: 'demo_ana',
    alias: 'Torre de Ana',
    distribution: 'fedora',
    diagnostic: {
      capturado_en: '2026-09-20T18:00:00Z',
      version_sistema: '6.10.6-200.fc40.x86_64',
      cpu_modelo: 'AMD Ryzen 7 5700X',
      gpu_modelo: 'AMD Radeon RX 6600',
      ram_mb: 32768,
      vram_mb: 8192,
      controlador: 'amdgpu',
      version_controlador: 'Mesa 24.1.7',
      gpu_pci_id: '1002:73ff',
      version_vulkan: '1.3.278',
      // Fedora sets up zram (capped at 8 GB) and no disk swap; Zen 3 is x86-64-v3.
      nivel_x86: 'v3',
      arranque_seguro: 'activo',
      tpm: '2.0',
      zram_mb: 8192,
      swap_mb: 0,
    },
  },
  brunoPc: {
    dueno: 'demo_bruno',
    alias: 'PC de Bruno',
    distribution: 'arch',
    diagnostic: {
      capturado_en: '2026-08-01T18:00:00Z',
      version_sistema: '6.10.3-arch1-1',
      cpu_modelo: 'Intel Core i5-12400F',
      gpu_modelo: 'NVIDIA GeForce RTX 3060',
      ram_mb: 16384,
      vram_mb: 12288,
      controlador: 'nvidia',
      version_controlador: '560.35.03',
      gpu_pci_id: '10de:2504',
      version_vulkan: '1.3.289',
    },
  },
  // Old hardware with no reports: the graphics path verdict must still say something.
  brunoViejo: {
    dueno: 'demo_bruno',
    alias: 'PC viejo de Bruno',
    distribution: 'ubuntu',
    diagnostic: {
      capturado_en: '2026-10-12T18:00:00Z',
      version_sistema: '7.0.0-30-generic',
      cpu_modelo: 'Intel Core i5-4570',
      gpu_modelo: 'NVIDIA GeForce GTX 760',
      ram_mb: 8192,
      vram_mb: 2048,
      controlador: 'nouveau',
      version_controlador: 'Mesa 25.2.8',
      // Kepler without vulkan-tools: Vulkan 1.2 is projected, so D3D9-11 go through DXVK-Sarek.
      gpu_pci_id: '10de:1187',
      soporte_vulkan: 'desconocido',
      version_vulkan: null,
      nivel_x86: 'v3',
    },
  },
  anaFamiliar: {
    dueno: 'demo_ana',
    alias: 'PC familiar de Ana',
    distribution: 'mint',
    diagnostic: {
      capturado_en: '2026-10-13T18:00:00Z',
      version_sistema: '6.5.0-44-generic',
      // Phenom II lacks SSSE3 and SSE4.1, so it stays at x86-64-v1 below CS2's v2.
      cpu_modelo: 'AMD Phenom II X4 965',
      gpu_modelo: 'NVIDIA GeForce GTX 1050 Ti',
      ram_mb: 8192,
      vram_mb: 4096,
      controlador: 'nvidia',
      version_controlador: null,
      gpu_pci_id: '10de:1c82',
      soporte_vulkan: 'desconocido',
      version_vulkan: null,
      nivel_x86: 'v1',
    },
  },
} as const satisfies Record<string, { dueno: Cuenta; alias: string; distribution: keyof typeof distribuciones; diagnostic: Readonly<Record<string, Valor>> }>

type ReporteDemo = {
  machine: keyof typeof equipos
  edicion: Edicion
  layer: keyof typeof capas
  conPerfil: boolean
  version_juego: string
  fecha_prueba: string
  resultado: Outcome
  medicion: { fps_promedio: number; resolucion: string; calidad_grafica: string; metodo_medicion: string } | null
  fallos: ReadonlyArray<readonly [keyof typeof tiposFallo, string]>
  observaciones: string
  aprobar: boolean
}

const reportes: ReadonlyArray<ReporteDemo> = [
  {
    machine: 'anaPortatil', edicion: ['gta5', 'steam'], layer: 'proton8', conPerfil: true, version_juego: '1.0.3179',
    fecha_prueba: '2026-09-28T20:00:00Z', resultado: 'funciona',
    medicion: { fps_promedio: 54, resolucion: '1280x720', calidad_grafica: 'Bajo', metodo_medicion: 'MangoHud · misión Prólogo · 5 min' },
    fallos: [], observaciones: 'Seguí el perfil al pie de la letra. Historia y GTA Online sin cierres en dos horas.', aprobar: true,
  },
  {
    machine: 'anaPortatil', edicion: ['gta5', 'steam'], layer: 'proton8', conPerfil: true, version_juego: '1.0.3179',
    fecha_prueba: '2026-09-14T20:00:00Z', resultado: 'funciona', medicion: null,
    fallos: [], observaciones: 'Primera prueba con el perfil. Sin medir FPS; se juega fluido en gráficos bajos.', aprobar: true,
  },
  {
    machine: 'brunoPc', edicion: ['gta5', 'epic'], layer: 'ge94', conPerfil: false, version_juego: '1.0.3179',
    fecha_prueba: '2026-09-02T21:00:00Z', resultado: 'funciona_con_ajustes',
    medicion: { fps_promedio: 60, resolucion: '1920x1080', calidad_grafica: 'Medio', metodo_medicion: 'MangoHud · conducción en ciudad · 10 min' },
    fallos: [], observaciones: 'Desde Heroic. Hubo que desactivar la superposición de Epic para que el juego pasara del menú.', aprobar: true,
  },
  {
    machine: 'anaTorre', edicion: ['gta5', 'steam'], layer: 'proton9', conPerfil: false, version_juego: '1.0.3258',
    fecha_prueba: '2026-10-02T19:00:00Z', resultado: 'falla_en_ejecucion', medicion: null,
    fallos: [['lanzador', 'El Rockstar Games Launcher se queda en «Actualizando» y se cierra tras unos minutos de juego.']],
    observaciones: 'Tras la actualización 1.0.3258 el lanzador corta la partida a los pocos minutos.', aprobar: true,
  },
  {
    machine: 'brunoPc', edicion: ['gta5', 'steam'], layer: 'ge94', conPerfil: false, version_juego: '1.0.3258',
    fecha_prueba: '2026-10-05T21:00:00Z', resultado: 'funciona_con_ajustes', medicion: null,
    fallos: [], observaciones: 'Con GE-Proton 9-4 y el argumento -nobattleye funciona la historia; Online no probado.', aprobar: false,
  },
  {
    machine: 'anaPortatil', edicion: ['valorant', 'riot'], layer: 'wine9', conPerfil: false, version_juego: '9.07',
    fecha_prueba: '2026-07-11T20:00:00Z', resultado: 'no_inicia', medicion: null,
    fallos: [['anti_cheat', 'Vanguard exige su controlador de kernel de Windows y el cliente no deja entrar.']],
    observaciones: 'El cliente de Riot se instala, pero Vanguard bloquea el juego antes del menú.', aprobar: true,
  },
  {
    machine: 'brunoPc', edicion: ['valorant', 'riot'], layer: 'ge94', conPerfil: false, version_juego: '9.07',
    fecha_prueba: '2026-08-03T21:00:00Z', resultado: 'no_inicia', medicion: null,
    fallos: [['anti_cheat', 'Vanguard no arranca fuera de Windows; el juego muestra el error VAN 1067.']],
    observaciones: 'Mismo bloqueo con GE-Proton: el anti-trampas no admite Linux.', aprobar: true,
  },
  {
    machine: 'anaPortatil', edicion: ['ets2', 'steam'], layer: 'nativo', conPerfil: true, version_juego: '1.50.1.2s',
    fecha_prueba: '2026-09-10T20:00:00Z', resultado: 'funciona', medicion: null,
    fallos: [], observaciones: 'Versión nativa, sin herramienta de compatibilidad. Una hora de ruta sin problemas.', aprobar: false,
  },
  {
    machine: 'brunoPc', edicion: ['ets2', 'steam'], layer: 'nativo', conPerfil: false, version_juego: '1.50.1.2s',
    fecha_prueba: '2026-09-12T21:00:00Z', resultado: 'funciona_con_ajustes', medicion: null,
    fallos: [], observaciones: 'Funciona nativo; el volante necesitó configurar los ejes a mano.', aprobar: false,
  },
  {
    machine: 'anaTorre', edicion: ['witcher3', 'steam'], layer: 'proton9', conPerfil: true, version_juego: '4.04',
    fecha_prueba: '2026-10-06T19:00:00Z', resultado: 'funciona', medicion: null,
    fallos: [], observaciones: 'Con el perfil el juego abre directo, sin el lanzador de CD Projekt, y se mantiene a 60 FPS en Novigrado.', aprobar: true,
  },
]

const solucionDemo = {
  reporte: 3,
  tipoFallo: 'lanzador',
  titulo: 'Reinstalar el Rockstar Games Launcher dentro del prefijo de Proton',
  instrucciones: [
    '1. Cierra Steam y borra la carpeta del lanzador dentro del prefijo: steamapps/compatdata/271590/pfx/drive_c/Program Files/Rockstar Games/Launcher.',
    '2. Abre el juego desde Steam: el lanzador se vuelve a instalar solo.',
    '3. Inicia sesión y espera a que termine de actualizar antes de entrar al juego.',
  ].join('\n'),
} as const satisfies { reporte: number; tipoFallo: keyof typeof tiposFallo; titulo: string; instrucciones: string }

const aprobacionDemo = (que: string) =>
  Schema.decodeUnknownSync(Decision)({
    _tag: 'Aprobar',
    motivo: `${que} coherente con su entorno; aprobado para la demostración.`,
    evidencia: 'Datos de ejemplo: aporte sembrado por pnpm db:sembrar en una cuenta demo, no una prueba real.',
  })

const ConId = Schema.Struct({ id: Schema.Int })
const ConIdTexto = Schema.Struct({ id: Schema.String })

const de = <K, A>(ids: ReadonlyMap<K, A>, clave: K) => {
  const id = ids.get(clave)
  return id === undefined ? Effect.die(`la semilla no definió ${String(clave)}`) : Effect.succeed(id)
}

const programa = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  const nuevas = new Map<string, number>()
  const contar = (tabla: string) => nuevas.set(tabla, (nuevas.get(tabla) ?? 0) + 1)

  const asegurar = (tabla: string, clave: Readonly<Record<string, Valor>>, resto: Readonly<Record<string, Valor>> = {}) =>
    Effect.gen(function* () {
      const donde = sql.and(Object.entries(clave).map(([c, v]) => sql`${sql(c)} IS NOT DISTINCT FROM ${v}`))
      const [fila] = yield* rows(ConId, sql`SELECT id FROM ${sql(tabla)} WHERE ${donde}`)
      if (fila !== undefined) return { id: fila.id, inserted: false }
      const creada = yield* oneRow(ConId, sql`INSERT INTO ${sql(tabla)} ${sql.insert({ ...clave, ...resto })} RETURNING id`)
      contar(tabla)
      return { id: creada.id, inserted: true }
    })
  const idDe = (tabla: string, clave: Readonly<Record<string, Valor>>, resto: Readonly<Record<string, Valor>> = {}) =>
    Effect.map(asegurar(tabla, clave, resto), (r) => r.id)

  // Accounts go through better-auth so the password is hashed its way. Its own pool commits them
  // outside the transaction below; the lookup by correo makes a rerun skip them.
  const user = new Map<Cuenta, string>()
  for (const [alias, role] of Record.toEntries(cuentas)) {
    const email = correoDe(alias)
    const [existente] = yield* rows(ConIdTexto, sql`SELECT id FROM app_user WHERE email = ${email}`)
    if (existente === undefined) contar('app_user')
    const id =
      existente?.id ?? (yield* Effect.promise(() => auth.api.signUpEmail({ body: { name: alias, email, password: contrasenaDemo } }))).user.id
    if ((yield* assignRole(email, role)).changed) contar('app_user.role')
    user.set(alias, id)
  }

  yield* sql.withTransaction(
    Effect.gen(function* () {
      const launcher = new Map<keyof typeof launchers, number>()
      for (const [k, l] of Record.toEntries(launchers)) launcher.set(k, yield* idDe('launcher', { name: l.name }, { official_url: l.official_url }))

      const distribution = new Map<keyof typeof distribuciones, number>()
      for (const [k, d] of Record.toEntries(distribuciones))
        distribution.set(k, yield* idDe('distribution', { name: d.name, version: d.version }, { official_url: d.official_url }))

      const layer = new Map<keyof typeof capas, number>()
      for (const [k, c] of Record.toEntries(capas)) layer.set(k, yield* idDe('layer_version', c))

      const tipoFallo = new Map<keyof typeof tiposFallo, number>()
      for (const [code, description] of Record.toEntries(tiposFallo)) tipoFallo.set(code, yield* idDe('failure_type', { code }, { description }))

      const dependency = new Map<keyof typeof dependencias, number>()
      for (const [k, d] of Record.toEntries(dependencias))
        dependency.set(k, yield* idDe('dependency', { name: d.name, package_manager: d.package_manager }, { description: d.description }))

      const edicion = new Map<string, number>()
      for (const [k, j] of Record.toEntries(juegos)) {
        const game_id = yield* idDe('game', { title: j.title }, { description: j.description })
        // Converges on reruns: fills the level on a database seeded before the column existed.
        const nivel = yield* sql`UPDATE game SET x86_level_min = ${j.x86_level_min} WHERE id = ${game_id} AND x86_level_min IS DISTINCT FROM ${j.x86_level_min} RETURNING id`
        if (nivel.length > 0) contar('game.x86_level_min')
        const apis = yield* sql`INSERT INTO game_api ${sql.insert(j.apis.map((api) => ({ game_id, api })))} ON CONFLICT DO NOTHING RETURNING api`
        for (const _ of apis) contar('game_api')
        const ediciones: Partial<Record<keyof typeof launchers, string | null>> = j.ediciones
        for (const l of Record.keys(launchers)) {
          const external_id = ediciones[l]
          if (external_id === undefined) continue
          const launcher_id = yield* de(launcher, l)
          edicion.set(`${k}/${l}`, yield* idDe('game_edition', { game_id, launcher_id }, { external_id }))
        }
      }

      const perfilDe = new Map<string, number>()
      for (const p of perfiles) {
        const profile = yield* asegurar(
          'profile',
          {
            edition_id: yield* de(edicion, p.edicion.join('/')),
            distribution_id: yield* de(distribution, p.distribution),
            layer_version_id: yield* de(layer, p.layer),
            architecture: 'x86_64',
            revision: 1,
          },
          {
            author_id: yield* de(user, p.author),
            title: p.title,
            ram_min_mb: p.ram_min_mb,
            vram_min_mb: p.vram_min_mb,
            requires_vulkan: p.requires_vulkan,
            vulkan_version_min: p.vulkan_version_min,
            launch_options: p.launch_options,
          },
        )
        perfilDe.set(clavePerfil(p), profile.id)
        if (!profile.inserted) continue
        for (const [i, [title, instruction]] of p.steps.entries()) {
          yield* sql`INSERT INTO profile_step ${sql.insert({ profile_id: profile.id, position: i + 1, title, instruction })}`
          contar('profile_step')
        }
        for (const d of p.dependencias) {
          const fila = { profile_id: profile.id, dependency_id: yield* de(dependency, d.dependency), required: d.required, install_instruction: d.install_instruction }
          yield* sql`INSERT INTO profile_dependency ${sql.insert(fila)}`
          contar('profile_dependency')
        }
      }

      for (const g of guias)
        yield* idDe(
          'adoption_guide',
          { title: g.title },
          {
            author_id: yield* de(user, 'demo_revisor'),
            distribution_id: g.distribution === null ? null : yield* de(distribution, g.distribution),
            type: g.type,
            content: g.content,
            revision: 1,
            status: 'publicada',
          },
        )

      const como = <A, E, R>(alias: Cuenta, programa: Effect.Effect<A, E, R>) =>
        Effect.flatMap(de(user, alias), (id) =>
          Effect.provideService(programa, Visitor, Option.some({ id: Schema.decodeSync(UserId)(id), alias, role: cuentas[alias] })),
        )

      const diagnosticoDe = new Map<keyof typeof equipos, number>()
      for (const [k, eq] of Record.toEntries(equipos)) {
        const { name, version } = distribuciones[eq.distribution]
        // As detector output: the manual form drops the PCI id and the CPU level the verdicts read.
        const payload = {
          version_esquema: SCHEMA_VERSION,
          sistema: 'Linux',
          distribucion: { nombre: name, version },
          arquitectura: 'x86_64',
          soporte_vulkan: 'si',
          biblioteca_steam: null,
          ...eq.diagnostic,
        }
        const guardar = yield* Schema.decodeUnknownEffect(SaveDiagnostic)({
          equipo: { _tag: 'nuevo', alias: eq.alias },
          entrada: { _tag: 'detector', texto: JSON.stringify(payload) },
        })
        const { id, inserted } = yield* como(eq.dueno, submitDiagnostic(guardar))
        if (inserted) contar('diagnostic')
        diagnosticoDe.set(k, id)
      }

      const reporteDe = new Map<number, number>()
      for (const [i, r] of reportes.entries()) {
        const eq = equipos[r.machine]
        const diagnostico_id = yield* de(diagnosticoDe, r.machine)
        const edicion_id = yield* de(edicion, r.edicion.join('/'))
        const [existente] = yield* rows(
          ConId,
          sql`SELECT id FROM report WHERE diagnostic_id = ${diagnostico_id} AND edition_id = ${edicion_id} AND tested_at = ${r.fecha_prueba}`,
        )
        if (existente !== undefined) {
          reporteDe.set(i, existente.id)
          continue
        }
        const fallos: Array<{ tipo_fallo_id: number; detalle: string }> = []
        for (const [code, detalle] of r.fallos) fallos.push({ tipo_fallo_id: yield* de(tipoFallo, code), detalle })
        const inserted = yield* Schema.decodeUnknownEffect(NewReport)({
          edicion_id,
          diagnostico_id,
          version_capa: { _tag: 'existente', id: yield* de(layer, r.layer) },
          perfil_id: r.conPerfil ? yield* de(perfilDe, clavePerfil({ edicion: r.edicion, distribution: eq.distribution, layer: r.layer })) : null,
          version_juego: r.version_juego,
          version_lanzador: null,
          fecha_prueba: r.fecha_prueba,
          resultado: r.resultado,
          medicion: r.medicion,
          fallos,
          observaciones: r.observaciones,
        })
        reporteDe.set(i, (yield* como(eq.dueno, submitReport(inserted))).id)
        contar('report')
      }

      const sol = solucionDemo
      const reporte_id = yield* de(reporteDe, sol.reporte)
      const tipo_fallo_id = yield* de(tipoFallo, sol.tipoFallo)
      const [solucionExistente] = yield* rows(
        ConId,
        sql`SELECT id FROM solution WHERE report_id = ${reporte_id} AND failure_type_id = ${tipo_fallo_id} AND title = ${sol.titulo}`,
      )
      let solucion_id = solucionExistente?.id
      if (solucion_id === undefined) {
        const nueva = yield* Schema.decodeUnknownEffect(NewSolution)({ reporte_id, tipo_fallo_id, perfil_id: null, titulo: sol.titulo, instrucciones: sol.instrucciones })
        solucion_id = (yield* como('demo_bruno', submitSolution(nueva))).id
        contar('solution')
      }

      const aprobar = (ref: { _tag: ContributionRef['_tag']; id: number }, que: string) =>
        Effect.gen(function* () {
          const { changed: change } = yield* como('demo_revisor', decide(yield* Schema.decodeUnknownEffect(ContributionRef)(ref), aprobacionDemo(que)))
          if (change) contar(`aprobación de ${ref._tag}`)
        })
      for (const [i, r] of reportes.entries()) if (r.aprobar) yield* aprobar({ _tag: 'reporte', id: yield* de(reporteDe, i) }, 'Reporte')
      const probados = new Set<number>()
      for (const r of reportes)
        if (r.aprobar && r.conPerfil && !requiresFailure[r.resultado])
          probados.add(yield* de(perfilDe, clavePerfil({ edicion: r.edicion, distribution: equipos[r.machine].distribution, layer: r.layer })))
      for (const id of probados) yield* aprobar({ _tag: 'perfil', id }, 'Perfil con un reporte funcional aprobado,')
      yield* aprobar({ _tag: 'solucion', id: solucion_id }, 'Solución')
    }),
  )

  yield* Effect.log(
    nuevas.size === 0 ? 'La semilla ya estaba aplicada; nada que cambiar.' : `Filas nuevas: ${[...nuevas].map(([t, n]) => `${t} ${n}`).join(', ')}`,
  )
  yield* Effect.log(`Cuentas demo, contraseña «${contrasenaDemo}»: ${Record.toEntries(cuentas).map(([a, r]) => `${correoDe(a)} (${r})`).join(', ')}`)
}).pipe(Effect.provide(PgLive))

Effect.runPromise(programa).then(
  () => process.exit(0),
  (e: unknown) => {
    console.error(e)
    process.exit(1)
  },
)
