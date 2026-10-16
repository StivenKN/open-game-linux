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

const demoPassword = 'opengame-demo'

const accounts = {
  demo_revisor: 'revisor',
  demo_admin: 'administrador',
  demo_ana: 'usuario',
  demo_bruno: 'usuario',
} as const satisfies Record<string, Role>
type Account = keyof typeof accounts
const emailOf = (alias: Account) => `${alias}@${demoDomain}`

const launchers = {
  steam: { name: STEAM_LAUNCHER, official_url: 'https://store.steampowered.com' },
  epic: { name: 'Epic Games Store', official_url: 'https://store.epicgames.com' },
  gog: { name: 'GOG', official_url: 'https://www.gog.com' },
  riot: { name: 'Riot Client', official_url: 'https://www.riotgames.com' },
} as const

const distributions = {
  mint: { name: 'Linux Mint', version: '21.3', official_url: 'https://linuxmint.com' },
  ubuntu: { name: 'Ubuntu', version: '24.04', official_url: 'https://ubuntu.com' },
  fedora: { name: 'Fedora', version: '40', official_url: 'https://fedoraproject.org' },
  arch: { name: 'Arch Linux', version: 'rolling', official_url: 'https://archlinux.org' },
  pop: { name: 'Pop!_OS', version: '22.04', official_url: 'https://pop.system76.com' },
} as const

const layers = {
  proton8: { family: 'Proton', variant: 'Valve', version: '8.0-5' },
  proton9: { family: 'Proton', variant: 'Valve', version: '9.0-3' },
  ge94: { family: 'Proton', variant: 'GE', version: '9-4' },
  wine9: { family: 'Wine', variant: 'estable', version: '9.0' },
  native: { family: 'Nativo', variant: 'Steam Linux Runtime', version: '3.0' },
} as const satisfies Record<string, { family: LayerFamily; variant: string; version: string }>

const failureTypes = {
  anti_cheat: 'El sistema anti-trampas del juego bloquea Linux o la capa de compatibilidad.',
  drm: 'La protección anticopia impide iniciar el juego.',
  lanzador: 'El lanzador del editor no abre, no inicia sesión o no termina de actualizar.',
  controlador: 'Falta un controlador de video o su versión no es compatible.',
  dependencia: 'Falta una biblioteca o componente que el juego necesita.',
  rendimiento: 'El juego corre, pero con caídas de FPS o tirones que lo hacen injugable.',
  otro: 'Causa no identificada.',
}

const dependencies = {
  vcrun2019: { name: 'vcrun2019', package_manager: 'winetricks', description: 'Bibliotecas de Visual C++ 2015-2019 para juegos de Windows.' },
  d3dcompiler_47: { name: 'd3dcompiler_47', package_manager: 'winetricks', description: 'Compilador de sombreadores de DirectX que algunos juegos esperan encontrar.' },
  gamemode: { name: 'gamemode', package_manager: 'apt', description: 'Demonio de Feral que ajusta la CPU y el planificador mientras juegas.' },
  mangohud: { name: 'mangohud', package_manager: 'apt', description: 'Superposición que muestra FPS, temperaturas y uso de GPU.' },
} as const

const games = {
  gta5: {
    title: 'Grand Theft Auto V',
    description: 'Mundo abierto de acción en Los Santos, con historia para un jugador y GTA Online.',
    editions: { steam: '271590', epic: null },
    apis: ['d3d10', 'd3d11', 'd3d12'],
    x86_level_min: null,
  },
  valorant: {
    title: 'Valorant',
    description: 'Shooter táctico competitivo de Riot Games, cinco contra cinco.',
    editions: { riot: null },
    apis: ['d3d11'],
    x86_level_min: null,
  },
  ets2: {
    title: 'Euro Truck Simulator 2',
    description: 'Simulador de camiones por las carreteras de Europa. Tiene versión nativa para Linux.',
    editions: { steam: '227300' },
    apis: ['d3d11', 'opengl'],
    x86_level_min: null,
  },
  eldenRing: {
    title: 'Elden Ring',
    description: 'Rol de acción en mundo abierto de FromSoftware.',
    editions: { steam: '1245620' },
    apis: ['d3d12'],
    x86_level_min: null,
  },
  witcher3: {
    title: 'The Witcher 3: Wild Hunt',
    description: 'Rol de mundo abierto de CD Projekt RED protagonizado por Geralt de Rivia.',
    editions: { steam: '292030', gog: null },
    apis: ['d3d11', 'd3d12'],
    x86_level_min: null,
  },
  cs2: {
    title: 'Counter-Strike 2',
    description: 'Shooter táctico competitivo de Valve. Tiene versión nativa para Linux.',
    editions: { steam: '730' },
    apis: ['vulkan', 'd3d11'],
    x86_level_min: 'v2', // Source 2 needs SSE4.2
  },
} as const satisfies Record<
  string,
  {
    title: string
    description: string
    editions: Partial<Record<keyof typeof launchers, string | null>>
    apis: ReadonlyArray<GraphicsApi>
    x86_level_min: X86Level | null
  }
>

type Edition = { [J in keyof typeof games]: readonly [J, keyof (typeof games)[J]['editions']] }[keyof typeof games]

type Profile = {
  edition: Edition
  distribution: keyof typeof distributions
  layer: keyof typeof layers
  author: Account
  title: string
  ram_min_mb: number | null
  vram_min_mb: number | null
  requires_vulkan: boolean | null
  vulkan_version_min: string | null
  launch_options: string | null
  steps: ReadonlyArray<readonly [title: string, instruction: string]>
  dependencies: ReadonlyArray<{ dependency: keyof typeof dependencies; required: boolean; install_instruction: string }>
}

const steamPlay = [
  'Activa Steam Play',
  'En Steam, abre Steam > Configuración > Compatibilidad y activa «Habilitar Steam Play para todos los demás títulos». Reinicia Steam.',
] as const
const chooseLayer = (layer: string) =>
  [
    `Elige ${layer}`,
    `En la biblioteca, clic derecho sobre el juego > Propiedades > Compatibilidad. Marca «Forzar el uso de una herramienta de compatibilidad» y elige ${layer}.`,
  ] as const
const launchOptions = [
  'Copia los parámetros de lanzamiento',
  'En Propiedades > General, pega los parámetros de este perfil en «Opciones de lanzamiento». Se copian tal cual; OpenGame nunca los ejecuta por ti.',
] as const

const profiles: ReadonlyArray<Profile> = [
  {
    edition: ['gta5', 'steam'],
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
      chooseLayer('Proton 8.0-5'),
      launchOptions,
      ['Deja terminar el Rockstar Games Launcher', 'La primera vez el lanzador de Rockstar se instala y se actualiza solo. Espera a que abra el juego antes de cambiar nada.'],
      ['Ajusta los gráficos', 'En el juego, Configuración > Gráficos: calidad de texturas «Normal» y sin MSAA.'],
    ],
    dependencies: [{ dependency: 'gamemode', required: false, install_instruction: 'sudo apt install gamemode' }],
  },
  {
    edition: ['eldenRing', 'steam'],
    distribution: 'ubuntu',
    layer: 'proton9',
    author: 'demo_bruno',
    title: 'Elden Ring base con Proton 9',
    ram_min_mb: 12288,
    vram_min_mb: 4096,
    requires_vulkan: true,
    vulkan_version_min: '1.3',
    launch_options: null,
    steps: [steamPlay, chooseLayer('Proton 9.0-3'), ['Primera ejecución', 'La primera partida compila sombreadores y puede ir a tirones unos minutos. Es normal.']],
    dependencies: [],
  },
  {
    edition: ['witcher3', 'gog'],
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
    dependencies: [
      { dependency: 'vcrun2019', required: true, install_instruction: 'En Heroic, configuración del juego > Winetricks, instala vcrun2019.' },
    ],
  },
  {
    edition: ['ets2', 'steam'],
    distribution: 'mint',
    layer: 'native',
    author: 'demo_bruno',
    title: 'ETS2 nativo en Linux Mint',
    ram_min_mb: 4096,
    vram_min_mb: null,
    requires_vulkan: null,
    vulkan_version_min: null,
    launch_options: null,
    steps: [['Instala la versión nativa', 'No fuerces ninguna herramienta de compatibilidad: Steam descarga la versión para Linux.']],
    dependencies: [],
  },
  {
    edition: ['cs2', 'steam'],
    distribution: 'arch',
    layer: 'native',
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
    dependencies: [{ dependency: 'mangohud', required: false, install_instruction: 'Instala mangohud con el gestor de tu distribución (en Arch: sudo pacman -S mangohud).' }],
  },
  // The one demo profile with something to translate into a umu-protonfixes file (and two things that do not).
  {
    edition: ['witcher3', 'steam'],
    distribution: 'fedora',
    layer: 'proton9',
    author: 'demo_bruno',
    title: 'The Witcher 3 de Steam sin lanzador con Proton 9',
    ram_min_mb: 8192,
    vram_min_mb: 2048,
    requires_vulkan: true,
    vulkan_version_min: '1.1',
    launch_options: 'DXVK_FRAME_RATE=60 gamemoderun %command% --launcher-skip',
    steps: [steamPlay, chooseLayer('Proton 9.0-3'), launchOptions],
    dependencies: [
      { dependency: 'd3dcompiler_47', required: true, install_instruction: 'protontricks 292030 d3dcompiler_47' },
      { dependency: 'gamemode', required: false, install_instruction: 'sudo dnf install gamemode' },
    ],
  },
]

const guides: ReadonlyArray<{ type: GuideType; distribution: keyof typeof distributions | null; title: string; content: string }> = [
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

type Value = string | number | boolean | null

const profileKey = (p: Pick<Profile, 'edition' | 'distribution' | 'layer'>) => `${p.edition.join('/')}|${p.distribution}|${p.layer}`

const machines = {
  anaLaptop: {
    owner: 'demo_ana',
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
  anaTower: {
    owner: 'demo_ana',
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
    owner: 'demo_bruno',
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
  brunoOld: {
    owner: 'demo_bruno',
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
  anaFamily: {
    owner: 'demo_ana',
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
} as const satisfies Record<string, { owner: Account; alias: string; distribution: keyof typeof distributions; diagnostic: Readonly<Record<string, Value>> }>

type DemoReport = {
  machine: keyof typeof machines
  edition: Edition
  layer: keyof typeof layers
  withProfile: boolean
  game_version: string
  tested_at: string
  outcome: Outcome
  measurement: { avg_fps: number; resolution: string; graphics_quality: string; measurement_method: string } | null
  failures: ReadonlyArray<readonly [keyof typeof failureTypes, string]>
  observations: string
  approve: boolean
}

const reports: ReadonlyArray<DemoReport> = [
  {
    machine: 'anaLaptop', edition: ['gta5', 'steam'], layer: 'proton8', withProfile: true, game_version: '1.0.3179',
    tested_at: '2026-09-28T20:00:00Z', outcome: 'funciona',
    measurement: { avg_fps: 54, resolution: '1280x720', graphics_quality: 'Bajo', measurement_method: 'MangoHud · misión Prólogo · 5 min' },
    failures: [], observations: 'Seguí el perfil al pie de la letra. Historia y GTA Online sin cierres en dos horas.', approve: true,
  },
  {
    machine: 'anaLaptop', edition: ['gta5', 'steam'], layer: 'proton8', withProfile: true, game_version: '1.0.3179',
    tested_at: '2026-09-14T20:00:00Z', outcome: 'funciona', measurement: null,
    failures: [], observations: 'Primera prueba con el perfil. Sin medir FPS; se juega fluido en gráficos bajos.', approve: true,
  },
  {
    machine: 'brunoPc', edition: ['gta5', 'epic'], layer: 'ge94', withProfile: false, game_version: '1.0.3179',
    tested_at: '2026-09-02T21:00:00Z', outcome: 'funciona_con_ajustes',
    measurement: { avg_fps: 60, resolution: '1920x1080', graphics_quality: 'Medio', measurement_method: 'MangoHud · conducción en ciudad · 10 min' },
    failures: [], observations: 'Desde Heroic. Hubo que desactivar la superposición de Epic para que el juego pasara del menú.', approve: true,
  },
  {
    machine: 'anaTower', edition: ['gta5', 'steam'], layer: 'proton9', withProfile: false, game_version: '1.0.3258',
    tested_at: '2026-10-02T19:00:00Z', outcome: 'falla_en_ejecucion', measurement: null,
    failures: [['lanzador', 'El Rockstar Games Launcher se queda en «Actualizando» y se cierra tras unos minutos de juego.']],
    observations: 'Tras la actualización 1.0.3258 el lanzador corta la partida a los pocos minutos.', approve: true,
  },
  {
    machine: 'brunoPc', edition: ['gta5', 'steam'], layer: 'ge94', withProfile: false, game_version: '1.0.3258',
    tested_at: '2026-10-05T21:00:00Z', outcome: 'funciona_con_ajustes', measurement: null,
    failures: [], observations: 'Con GE-Proton 9-4 y el argumento -nobattleye funciona la historia; Online no probado.', approve: false,
  },
  {
    machine: 'anaLaptop', edition: ['valorant', 'riot'], layer: 'wine9', withProfile: false, game_version: '9.07',
    tested_at: '2026-07-11T20:00:00Z', outcome: 'no_inicia', measurement: null,
    failures: [['anti_cheat', 'Vanguard exige su controlador de kernel de Windows y el cliente no deja entrar.']],
    observations: 'El cliente de Riot se instala, pero Vanguard bloquea el juego antes del menú.', approve: true,
  },
  {
    machine: 'brunoPc', edition: ['valorant', 'riot'], layer: 'ge94', withProfile: false, game_version: '9.07',
    tested_at: '2026-08-03T21:00:00Z', outcome: 'no_inicia', measurement: null,
    failures: [['anti_cheat', 'Vanguard no arranca fuera de Windows; el juego muestra el error VAN 1067.']],
    observations: 'Mismo bloqueo con GE-Proton: el anti-trampas no admite Linux.', approve: true,
  },
  {
    machine: 'anaLaptop', edition: ['ets2', 'steam'], layer: 'native', withProfile: true, game_version: '1.50.1.2s',
    tested_at: '2026-09-10T20:00:00Z', outcome: 'funciona', measurement: null,
    failures: [], observations: 'Versión nativa, sin herramienta de compatibilidad. Una hora de ruta sin problemas.', approve: false,
  },
  {
    machine: 'brunoPc', edition: ['ets2', 'steam'], layer: 'native', withProfile: false, game_version: '1.50.1.2s',
    tested_at: '2026-09-12T21:00:00Z', outcome: 'funciona_con_ajustes', measurement: null,
    failures: [], observations: 'Funciona nativo; el volante necesitó configurar los ejes a mano.', approve: false,
  },
  {
    machine: 'anaTower', edition: ['witcher3', 'steam'], layer: 'proton9', withProfile: true, game_version: '4.04',
    tested_at: '2026-10-06T19:00:00Z', outcome: 'funciona', measurement: null,
    failures: [], observations: 'Con el perfil el juego abre directo, sin el lanzador de CD Projekt, y se mantiene a 60 FPS en Novigrado.', approve: true,
  },
]

const demoSolution = {
  report: 3,
  failureType: 'lanzador',
  title: 'Reinstalar el Rockstar Games Launcher dentro del prefijo de Proton',
  instructions: [
    '1. Cierra Steam y borra la carpeta del lanzador dentro del prefijo: steamapps/compatdata/271590/pfx/drive_c/Program Files/Rockstar Games/Launcher.',
    '2. Abre el juego desde Steam: el lanzador se vuelve a instalar solo.',
    '3. Inicia sesión y espera a que termine de actualizar antes de entrar al juego.',
  ].join('\n'),
} as const satisfies { report: number; failureType: keyof typeof failureTypes; title: string; instructions: string }

const demoApproval = (subject: string) =>
  Schema.decodeUnknownSync(Decision)({
    _tag: 'Aprobar',
    reason: `${subject} coherente con su entorno; aprobado para la demostración.`,
    evidence: 'Datos de ejemplo: aporte sembrado por pnpm db:sembrar en una cuenta demo, no una prueba real.',
  })

const IdRow = Schema.Struct({ id: Schema.Int })
const TextIdRow = Schema.Struct({ id: Schema.String })

const lookup = <K, A>(ids: ReadonlyMap<K, A>, key: K) => {
  const id = ids.get(key)
  return id === undefined ? Effect.die(`the seed did not define ${String(key)}`) : Effect.succeed(id)
}

const program = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  const insertedRows = new Map<string, number>()
  const count = (table: string) => insertedRows.set(table, (insertedRows.get(table) ?? 0) + 1)

  const ensure = (table: string, key: Readonly<Record<string, Value>>, rest: Readonly<Record<string, Value>> = {}) =>
    Effect.gen(function* () {
      const where = sql.and(Object.entries(key).map(([c, v]) => sql`${sql(c)} IS NOT DISTINCT FROM ${v}`))
      const [row] = yield* rows(IdRow, sql`SELECT id FROM ${sql(table)} WHERE ${where}`)
      if (row !== undefined) return { id: row.id, inserted: false }
      const created = yield* oneRow(IdRow, sql`INSERT INTO ${sql(table)} ${sql.insert({ ...key, ...rest })} RETURNING id`)
      count(table)
      return { id: created.id, inserted: true }
    })
  const idOf = (table: string, key: Readonly<Record<string, Value>>, rest: Readonly<Record<string, Value>> = {}) =>
    Effect.map(ensure(table, key, rest), (r) => r.id)

  // Accounts go through better-auth so the password is hashed its way. Its own pool commits them
  // outside the transaction below; the lookup by email makes a rerun skip them.
  const user = new Map<Account, string>()
  for (const [alias, role] of Record.toEntries(accounts)) {
    const email = emailOf(alias)
    const [existing] = yield* rows(TextIdRow, sql`SELECT id FROM app_user WHERE email = ${email}`)
    if (existing === undefined) count('app_user')
    const id =
      existing?.id ?? (yield* Effect.promise(() => auth.api.signUpEmail({ body: { name: alias, email, password: demoPassword } }))).user.id
    if ((yield* assignRole(email, role)).changed) count('app_user.role')
    user.set(alias, id)
  }

  yield* sql.withTransaction(
    Effect.gen(function* () {
      const launcher = new Map<keyof typeof launchers, number>()
      for (const [k, l] of Record.toEntries(launchers)) launcher.set(k, yield* idOf('launcher', { name: l.name }, { official_url: l.official_url }))

      const distribution = new Map<keyof typeof distributions, number>()
      for (const [k, d] of Record.toEntries(distributions))
        distribution.set(k, yield* idOf('distribution', { name: d.name, version: d.version }, { official_url: d.official_url }))

      const layer = new Map<keyof typeof layers, number>()
      for (const [k, c] of Record.toEntries(layers)) layer.set(k, yield* idOf('layer_version', c))

      const failureType = new Map<keyof typeof failureTypes, number>()
      for (const [code, description] of Record.toEntries(failureTypes)) failureType.set(code, yield* idOf('failure_type', { code }, { description }))

      const dependency = new Map<keyof typeof dependencies, number>()
      for (const [k, d] of Record.toEntries(dependencies))
        dependency.set(k, yield* idOf('dependency', { name: d.name, package_manager: d.package_manager }, { description: d.description }))

      const edition = new Map<string, number>()
      for (const [k, j] of Record.toEntries(games)) {
        const game_id = yield* idOf('game', { title: j.title }, { description: j.description })
        // Converges on reruns: fills the level on a database seeded before the column existed.
        const level = yield* sql`UPDATE game SET x86_level_min = ${j.x86_level_min} WHERE id = ${game_id} AND x86_level_min IS DISTINCT FROM ${j.x86_level_min} RETURNING id`
        if (level.length > 0) count('game.x86_level_min')
        const apis = yield* sql`INSERT INTO game_api ${sql.insert(j.apis.map((api) => ({ game_id, api })))} ON CONFLICT DO NOTHING RETURNING api`
        for (const _ of apis) count('game_api')
        const editions: Partial<Record<keyof typeof launchers, string | null>> = j.editions
        for (const l of Record.keys(launchers)) {
          const external_id = editions[l]
          if (external_id === undefined) continue
          const launcher_id = yield* lookup(launcher, l)
          edition.set(`${k}/${l}`, yield* idOf('game_edition', { game_id, launcher_id }, { external_id }))
        }
      }

      const profileOf = new Map<string, number>()
      for (const p of profiles) {
        const profile = yield* ensure(
          'profile',
          {
            edition_id: yield* lookup(edition, p.edition.join('/')),
            distribution_id: yield* lookup(distribution, p.distribution),
            layer_version_id: yield* lookup(layer, p.layer),
            architecture: 'x86_64',
            revision: 1,
          },
          {
            author_id: yield* lookup(user, p.author),
            title: p.title,
            ram_min_mb: p.ram_min_mb,
            vram_min_mb: p.vram_min_mb,
            requires_vulkan: p.requires_vulkan,
            vulkan_version_min: p.vulkan_version_min,
            launch_options: p.launch_options,
          },
        )
        profileOf.set(profileKey(p), profile.id)
        if (!profile.inserted) continue
        for (const [i, [title, instruction]] of p.steps.entries()) {
          yield* sql`INSERT INTO profile_step ${sql.insert({ profile_id: profile.id, position: i + 1, title, instruction })}`
          count('profile_step')
        }
        for (const d of p.dependencies) {
          const row = { profile_id: profile.id, dependency_id: yield* lookup(dependency, d.dependency), required: d.required, install_instruction: d.install_instruction }
          yield* sql`INSERT INTO profile_dependency ${sql.insert(row)}`
          count('profile_dependency')
        }
      }

      for (const g of guides)
        yield* idOf(
          'adoption_guide',
          { title: g.title },
          {
            author_id: yield* lookup(user, 'demo_revisor'),
            distribution_id: g.distribution === null ? null : yield* lookup(distribution, g.distribution),
            type: g.type,
            content: g.content,
            revision: 1,
            status: 'publicada',
          },
        )

      const asUser = <A, E, R>(alias: Account, effect: Effect.Effect<A, E, R>) =>
        Effect.flatMap(lookup(user, alias), (id) =>
          Effect.provideService(effect, Visitor, Option.some({ id: Schema.decodeSync(UserId)(id), alias, role: accounts[alias] })),
        )

      const diagnosticOf = new Map<keyof typeof machines, number>()
      for (const [k, machine] of Record.toEntries(machines)) {
        const { name, version } = distributions[machine.distribution]
        // As detector output: the manual form drops the PCI id and the CPU level the verdicts read.
        const payload = {
          version_esquema: SCHEMA_VERSION,
          sistema: 'Linux',
          distribucion: { nombre: name, version },
          arquitectura: 'x86_64',
          soporte_vulkan: 'si',
          biblioteca_steam: null,
          ...machine.diagnostic,
        }
        const save = yield* Schema.decodeUnknownEffect(SaveDiagnostic)({
          machine: { _tag: 'nuevo', alias: machine.alias },
          input: { _tag: 'detector', texto: JSON.stringify(payload) },
        })
        const { id, inserted } = yield* asUser(machine.owner, submitDiagnostic(save))
        if (inserted) count('diagnostic')
        diagnosticOf.set(k, id)
      }

      const reportOf = new Map<number, number>()
      for (const [i, r] of reports.entries()) {
        const machine = machines[r.machine]
        const diagnostic_id = yield* lookup(diagnosticOf, r.machine)
        const edition_id = yield* lookup(edition, r.edition.join('/'))
        const [existing] = yield* rows(
          IdRow,
          sql`SELECT id FROM report WHERE diagnostic_id = ${diagnostic_id} AND edition_id = ${edition_id} AND tested_at = ${r.tested_at}`,
        )
        if (existing !== undefined) {
          reportOf.set(i, existing.id)
          continue
        }
        const failures: Array<{ failure_type_id: number; detail: string }> = []
        for (const [code, detail] of r.failures) failures.push({ failure_type_id: yield* lookup(failureType, code), detail })
        const inserted = yield* Schema.decodeUnknownEffect(NewReport)({
          edition_id,
          diagnostic_id,
          layer_version: { _tag: 'existente', id: yield* lookup(layer, r.layer) },
          profile_id: r.withProfile ? yield* lookup(profileOf, profileKey({ edition: r.edition, distribution: machine.distribution, layer: r.layer })) : null,
          game_version: r.game_version,
          launcher_version: null,
          tested_at: r.tested_at,
          outcome: r.outcome,
          measurement: r.measurement,
          failures,
          observations: r.observations,
        })
        reportOf.set(i, (yield* asUser(machine.owner, submitReport(inserted))).id)
        count('report')
      }

      const sol = demoSolution
      const report_id = yield* lookup(reportOf, sol.report)
      const failure_type_id = yield* lookup(failureType, sol.failureType)
      const [existingSolution] = yield* rows(
        IdRow,
        sql`SELECT id FROM solution WHERE report_id = ${report_id} AND failure_type_id = ${failure_type_id} AND title = ${sol.title}`,
      )
      let solution_id = existingSolution?.id
      if (solution_id === undefined) {
        const newSolution = yield* Schema.decodeUnknownEffect(NewSolution)({ report_id, failure_type_id, profile_id: null, title: sol.title, instructions: sol.instructions })
        solution_id = (yield* asUser('demo_bruno', submitSolution(newSolution))).id
        count('solution')
      }

      const approve = (ref: { _tag: ContributionRef['_tag']; id: number }, subject: string) =>
        Effect.gen(function* () {
          const { changed: change } = yield* asUser('demo_revisor', decide(yield* Schema.decodeUnknownEffect(ContributionRef)(ref), demoApproval(subject)))
          if (change) count(`aprobación de ${ref._tag}`)
        })
      for (const [i, r] of reports.entries()) if (r.approve) yield* approve({ _tag: 'reporte', id: yield* lookup(reportOf, i) }, 'Reporte')
      const tested = new Set<number>()
      for (const r of reports)
        if (r.approve && r.withProfile && !requiresFailure[r.outcome])
          tested.add(yield* lookup(profileOf, profileKey({ edition: r.edition, distribution: machines[r.machine].distribution, layer: r.layer })))
      for (const id of tested) yield* approve({ _tag: 'perfil', id }, 'Perfil con un reporte funcional aprobado,')
      yield* approve({ _tag: 'solucion', id: solution_id }, 'Solución')
    }),
  )

  yield* Effect.log(
    insertedRows.size === 0 ? 'The seed was already applied; nothing to change.' : `New rows: ${[...insertedRows].map(([t, n]) => `${t} ${n}`).join(', ')}`,
  )
  yield* Effect.log(`Demo accounts, password «${demoPassword}»: ${Record.toEntries(accounts).map(([a, r]) => `${emailOf(a)} (${r})`).join(', ')}`)
}).pipe(Effect.provide(PgLive))

Effect.runPromise(program).then(
  () => process.exit(0),
  (e: unknown) => {
    console.error(e)
    process.exit(1)
  },
)
