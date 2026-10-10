// `pnpm db:sembrar`: demo data, part 1. Lookups, games and editions, pending profiles with their steps and
// dependencies, published guides, and the demo accounts. Part 2 (U5) replays the 8.10 walkthrough
// through the app's writers and decidir(); this part writes no report and approves nothing.
//
// Everything authored here belongs to a `@demo.opengame.test` account, which is what marks it as
// "Datos de ejemplo" (servidor/auth.ts dominioDemo). Catalog rows (games, distributions, Proton
// builds) are real facts, not claims, so they carry no mark.
//
// Idempotent: each row is looked up by its natural key and inserted only when missing, so a second
// run changes nothing and says so. The rows go in one transaction, so a crash leaves no half seed.
// A profile's steps and dependencies are written only together with a new profile: once a profile is
// used or reviewed, og_perfil_congelado refuses any write to them, even an ON CONFLICT DO NOTHING.
import { Effect, Record, Schema } from 'effect'
import { SqlClient } from 'effect/sql'
import type { TipoGuia } from '../src/dominio/guias.ts'
import type { FamiliaCapa } from '../src/dominio/literales.ts'
import type { Rol } from '../src/dominio/revision.ts'
import { asignarRol, auth, dominioDemo } from '../src/servidor/auth.ts'
import { PgLive } from '../src/servidor/runtime.ts'

/** Shared by every demo account, and printed at the end so the team can sign in. */
const contrasenaDemo = 'opengame-demo'

const cuentas = {
  demo_revisor: 'revisor',
  demo_admin: 'administrador',
  demo_ana: 'usuario',
  demo_bruno: 'usuario',
} as const satisfies Record<string, Rol>
type Cuenta = keyof typeof cuentas
const correoDe = (alias: Cuenta) => `${alias}@${dominioDemo}`

const lanzadores = {
  steam: { nombre: 'Steam', url_oficial: 'https://store.steampowered.com' },
  epic: { nombre: 'Epic Games Store', url_oficial: 'https://store.epicgames.com' },
  gog: { nombre: 'GOG', url_oficial: 'https://www.gog.com' },
  riot: { nombre: 'Riot Client', url_oficial: 'https://www.riotgames.com' },
} as const

const distribuciones = {
  mint: { nombre: 'Linux Mint', version: '21.3', url_oficial: 'https://linuxmint.com' },
  ubuntu: { nombre: 'Ubuntu', version: '24.04', url_oficial: 'https://ubuntu.com' },
  fedora: { nombre: 'Fedora', version: '40', url_oficial: 'https://fedoraproject.org' },
  arch: { nombre: 'Arch Linux', version: 'rolling', url_oficial: 'https://archlinux.org' },
  pop: { nombre: 'Pop!_OS', version: '22.04', url_oficial: 'https://pop.system76.com' },
} as const

const capas = {
  proton8: { familia: 'Proton', variante: 'Valve', version: '8.0-5' },
  proton9: { familia: 'Proton', variante: 'Valve', version: '9.0-3' },
  ge94: { familia: 'Proton', variante: 'GE', version: '9-4' },
  wine9: { familia: 'Wine', variante: 'estable', version: '9.0' },
  nativo: { familia: 'Nativo', variante: 'Steam Linux Runtime', version: '3.0' },
} as const satisfies Record<string, { familia: FamiliaCapa; variante: string; version: string }>

/** Codes match ui/vocabulario.ts `tiposFallo`, which labels them. */
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
  vcrun2019: { nombre: 'vcrun2019', gestor: 'winetricks', descripcion: 'Bibliotecas de Visual C++ 2015-2019 para juegos de Windows.' },
  d3dcompiler_47: { nombre: 'd3dcompiler_47', gestor: 'winetricks', descripcion: 'Compilador de sombreadores de DirectX que algunos juegos esperan encontrar.' },
  gamemode: { nombre: 'gamemode', gestor: 'apt', descripcion: 'Demonio de Feral que ajusta la CPU y el planificador mientras juegas.' },
  mangohud: { nombre: 'mangohud', gestor: 'apt', descripcion: 'Superposición que muestra FPS, temperaturas y uso de GPU.' },
} as const

const juegos = {
  gta5: {
    titulo: 'Grand Theft Auto V',
    descripcion: 'Mundo abierto de acción en Los Santos, con historia para un jugador y GTA Online.',
    ediciones: { steam: '271590', epic: null },
  },
  valorant: {
    titulo: 'Valorant',
    descripcion: 'Shooter táctico competitivo de Riot Games, cinco contra cinco.',
    ediciones: { riot: null },
  },
  ets2: {
    titulo: 'Euro Truck Simulator 2',
    descripcion: 'Simulador de camiones por las carreteras de Europa. Tiene versión nativa para Linux.',
    ediciones: { steam: '227300' },
  },
  eldenRing: {
    titulo: 'Elden Ring',
    descripcion: 'Rol de acción en mundo abierto de FromSoftware.',
    ediciones: { steam: '1245620' },
  },
  witcher3: {
    titulo: 'The Witcher 3: Wild Hunt',
    descripcion: 'Rol de mundo abierto de CD Projekt RED protagonizado por Geralt de Rivia.',
    ediciones: { steam: '292030', gog: null },
  },
  cs2: {
    titulo: 'Counter-Strike 2',
    descripcion: 'Shooter táctico competitivo de Valve. Tiene versión nativa para Linux.',
    ediciones: { steam: '730' },
  },
} as const satisfies Record<string, { titulo: string; descripcion: string; ediciones: Partial<Record<keyof typeof lanzadores, string | null>> }>

/** An edition is a game on a launcher, so a profile names both; an edition that does not exist stops the seed. */
type Edicion = { [J in keyof typeof juegos]: readonly [J, keyof (typeof juegos)[J]['ediciones']] }[keyof typeof juegos]

type Perfil = {
  edicion: Edicion
  distribucion: keyof typeof distribuciones
  capa: keyof typeof capas
  autor: Cuenta
  titulo: string
  ram_min_mb: number | null
  vram_min_mb: number | null
  requiere_vulkan: boolean | null
  version_vulkan_min: string | null
  parametros_lanzamiento: string | null
  pasos: ReadonlyArray<readonly [titulo: string, instruccion: string]>
  dependencias: ReadonlyArray<{ dependencia: keyof typeof dependencias; obligatoria: boolean; instruccion_instalacion: string }>
}

const steamPlay = [
  'Activa Steam Play',
  'En Steam, abre Steam > Configuración > Compatibilidad y activa «Habilitar Steam Play para todos los demás títulos». Reinicia Steam.',
] as const
const elegirCapa = (capa: string) =>
  [
    `Elige ${capa}`,
    `En la biblioteca, clic derecho sobre el juego > Propiedades > Compatibilidad. Marca «Forzar el uso de una herramienta de compatibilidad» y elige ${capa}.`,
  ] as const
const parametros = [
  'Copia los parámetros de lanzamiento',
  'En Propiedades > General, pega los parámetros de este perfil en «Opciones de lanzamiento». Se copian tal cual; OpenGame nunca los ejecuta por ti.',
] as const

/** All pending: approval needs a report that used the profile (8.9), which part 2 seeds through decidir(). */
const perfiles: ReadonlyArray<Perfil> = [
  {
    edicion: ['gta5', 'steam'],
    distribucion: 'mint',
    capa: 'proton8',
    autor: 'demo_ana',
    titulo: 'GTA V en gráficos bajos con Proton 8',
    ram_min_mb: 8192,
    vram_min_mb: 2048,
    requiere_vulkan: true,
    version_vulkan_min: '1.1',
    parametros_lanzamiento: 'gamemoderun %command%',
    pasos: [
      steamPlay,
      elegirCapa('Proton 8.0-5'),
      parametros,
      ['Deja terminar el Rockstar Games Launcher', 'La primera vez el lanzador de Rockstar se instala y se actualiza solo. Espera a que abra el juego antes de cambiar nada.'],
      ['Ajusta los gráficos', 'En el juego, Configuración > Gráficos: calidad de texturas «Normal» y sin MSAA.'],
    ],
    dependencias: [{ dependencia: 'gamemode', obligatoria: false, instruccion_instalacion: 'sudo apt install gamemode' }],
  },
  {
    edicion: ['eldenRing', 'steam'],
    distribucion: 'ubuntu',
    capa: 'proton9',
    autor: 'demo_bruno',
    titulo: 'Elden Ring base con Proton 9',
    ram_min_mb: 12288,
    vram_min_mb: 4096,
    requiere_vulkan: true,
    version_vulkan_min: '1.3',
    parametros_lanzamiento: null,
    pasos: [steamPlay, elegirCapa('Proton 9.0-3'), ['Primera ejecución', 'La primera partida compila sombreadores y puede ir a tirones unos minutos. Es normal.']],
    dependencias: [],
  },
  {
    edicion: ['witcher3', 'gog'],
    distribucion: 'fedora',
    capa: 'ge94',
    autor: 'demo_ana',
    titulo: 'The Witcher 3 de GOG con Heroic y GE-Proton',
    ram_min_mb: 8192,
    vram_min_mb: 2048,
    requiere_vulkan: true,
    version_vulkan_min: '1.1',
    parametros_lanzamiento: null,
    pasos: [
      ['Instala Heroic Games Launcher', 'Instálalo desde Flathub (flatpak install flathub com.heroicgameslauncher.hgl) y entra con tu cuenta de GOG.'],
      ['Descarga GE-Proton 9-4', 'En Heroic, Administrador de Wine > GE-Proton, descarga la versión 9-4.'],
      ['Configura el juego', 'En la configuración del juego en Heroic, elige GE-Proton 9-4 como versión de Wine.'],
    ],
    dependencias: [
      { dependencia: 'vcrun2019', obligatoria: true, instruccion_instalacion: 'En Heroic, configuración del juego > Winetricks, instala vcrun2019.' },
    ],
  },
  {
    edicion: ['ets2', 'steam'],
    distribucion: 'mint',
    capa: 'nativo',
    autor: 'demo_bruno',
    titulo: 'ETS2 nativo en Linux Mint',
    ram_min_mb: 4096,
    vram_min_mb: null,
    requiere_vulkan: null,
    version_vulkan_min: null,
    parametros_lanzamiento: null,
    pasos: [['Instala la versión nativa', 'No fuerces ninguna herramienta de compatibilidad: Steam descarga la versión para Linux.']],
    dependencias: [],
  },
  {
    edicion: ['cs2', 'steam'],
    distribucion: 'arch',
    capa: 'nativo',
    autor: 'demo_ana',
    titulo: 'CS2 nativo con Vulkan',
    ram_min_mb: 8192,
    vram_min_mb: 1024,
    requiere_vulkan: true,
    version_vulkan_min: '1.2',
    parametros_lanzamiento: null,
    pasos: [
      ['Instala la versión nativa', 'No fuerces ninguna herramienta de compatibilidad: CS2 usa Vulkan de forma nativa.'],
      ['Comprueba Vulkan', 'Ejecuta vulkaninfo --summary y confirma que aparece tu GPU.'],
    ],
    dependencias: [{ dependencia: 'mangohud', obligatoria: false, instruccion_instalacion: 'Instala mangohud con el gestor de tu distribución (en Arch: sudo pacman -S mangohud).' }],
  },
]

const guias: ReadonlyArray<{ tipo: TipoGuia; distribucion: keyof typeof distribuciones | null; titulo: string; contenido: string }> = [
  {
    tipo: 'eleccion_distribucion',
    distribucion: null,
    titulo: '¿Qué distribución elegir para jugar?',
    contenido: [
      'Si vienes de Windows, empieza por una distribución con escritorio familiar y controladores fáciles de instalar.',
      'Linux Mint 21.3 se parece a Windows y es estable. Ubuntu 24.04 tiene la comunidad más grande. Pop!_OS 22.04 ofrece una imagen con el controlador de NVIDIA ya incluido. Fedora 40 trae software más reciente. Arch Linux es para quien quiere armar su sistema pieza por pieza.',
      'Antes de decidir, revisa en OpenGame qué juegos tuyos tienen reportes aprobados en cada distribución.',
    ].join('\n\n'),
  },
  {
    tipo: 'instalacion',
    distribucion: 'mint',
    titulo: 'Instalar Linux Mint 21.3 para jugar',
    contenido: [
      '1. Descarga la imagen ISO desde linuxmint.com y grábala en una memoria USB con balenaEtcher o Ventoy.',
      '2. Arranca desde la memoria y elige «Instalar Linux Mint». Marca la casilla de códecs multimedia.',
      '3. Al terminar, abre el Gestor de controladores e instala el controlador recomendado para tu GPU.',
      '4. Instala Steam desde el Gestor de software y activa Steam Play.',
    ].join('\n'),
  },
  {
    tipo: 'arranque_dual',
    distribucion: 'ubuntu',
    titulo: 'Arranque dual Windows y Ubuntu 24.04',
    contenido: [
      'Haz una copia de seguridad antes de tocar particiones.',
      '1. En Windows, desactiva el inicio rápido y reduce la partición de Windows desde Administración de discos.',
      '2. Arranca el instalador de Ubuntu y elige «Instalar junto a Windows».',
      '3. Al reiniciar, GRUB te deja elegir el sistema. Si Windows no aparece, ejecuta sudo update-grub.',
    ].join('\n'),
  },
]

type Valor = string | number | boolean | null

const ConId = Schema.Array(Schema.Struct({ id: Schema.Int }))
const ConIdTexto = Schema.Array(Schema.Struct({ id: Schema.String }))

/** The id the seed stored under `clave`. A missing key is a mistake in the data above. */
const de = <K, A>(ids: ReadonlyMap<K, A>, clave: K) => {
  const id = ids.get(clave)
  return id === undefined ? Effect.die(`la semilla no definió ${String(clave)}`) : Effect.succeed(id)
}

const programa = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  const nuevas = new Map<string, number>()
  const contar = (tabla: string) => nuevas.set(tabla, (nuevas.get(tabla) ?? 0) + 1)

  /** The row's id by natural key, inserting `clave` + `resto` when it is missing. */
  const asegurar = (tabla: string, clave: Readonly<Record<string, Valor>>, resto: Readonly<Record<string, Valor>> = {}) =>
    Effect.gen(function* () {
      const donde = sql.and(Object.entries(clave).map(([c, v]) => sql`${sql(c)} IS NOT DISTINCT FROM ${v}`))
      const [fila] = yield* Schema.decodeUnknownEffect(ConId)(yield* sql`SELECT id FROM ${sql(tabla)} WHERE ${donde}`)
      if (fila !== undefined) return { id: fila.id, nuevo: false }
      const [creada] = yield* Schema.decodeUnknownEffect(ConId)(yield* sql`INSERT INTO ${sql(tabla)} ${sql.insert({ ...clave, ...resto })} RETURNING id`)
      if (creada === undefined) return yield* Effect.die(`INSERT en ${tabla} no devolvió id`)
      contar(tabla)
      return { id: creada.id, nuevo: true }
    })
  const idDe = (tabla: string, clave: Readonly<Record<string, Valor>>, resto: Readonly<Record<string, Valor>> = {}) =>
    Effect.map(asegurar(tabla, clave, resto), (r) => r.id)

  // Accounts go through better-auth so the password is hashed its way. Its own pool commits them
  // outside the transaction below; the lookup by correo makes a rerun skip them.
  const usuario = new Map<Cuenta, string>()
  for (const [alias, rol] of Record.toEntries(cuentas)) {
    const correo = correoDe(alias)
    const [existente] = yield* Schema.decodeUnknownEffect(ConIdTexto)(yield* sql`SELECT id FROM usuario WHERE correo = ${correo}`)
    if (existente === undefined) contar('usuario')
    const id =
      existente?.id ?? (yield* Effect.promise(() => auth.api.signUpEmail({ body: { name: alias, email: correo, password: contrasenaDemo } }))).user.id
    if ((yield* asignarRol(correo, rol)).cambio) contar('usuario.rol')
    usuario.set(alias, id)
  }

  yield* sql.withTransaction(
    Effect.gen(function* () {
      const lanzador = new Map<keyof typeof lanzadores, number>()
      for (const [k, l] of Record.toEntries(lanzadores)) lanzador.set(k, yield* idDe('lanzador', { nombre: l.nombre }, { url_oficial: l.url_oficial }))

      const distribucion = new Map<keyof typeof distribuciones, number>()
      for (const [k, d] of Record.toEntries(distribuciones))
        distribucion.set(k, yield* idDe('distribucion', { nombre: d.nombre, version: d.version }, { url_oficial: d.url_oficial }))

      const capa = new Map<keyof typeof capas, number>()
      for (const [k, c] of Record.toEntries(capas)) capa.set(k, yield* idDe('version_capa', c))

      for (const [codigo, descripcion] of Record.toEntries(tiposFallo)) yield* idDe('tipo_fallo', { codigo }, { descripcion })

      const dependencia = new Map<keyof typeof dependencias, number>()
      for (const [k, d] of Record.toEntries(dependencias))
        dependencia.set(k, yield* idDe('dependencia', { nombre: d.nombre, gestor: d.gestor }, { descripcion: d.descripcion }))

      const edicion = new Map<string, number>()
      for (const [k, j] of Record.toEntries(juegos)) {
        const juego_id = yield* idDe('juego', { titulo: j.titulo }, { descripcion: j.descripcion })
        const ediciones: Partial<Record<keyof typeof lanzadores, string | null>> = j.ediciones
        for (const l of Record.keys(lanzadores)) {
          const identificador_externo = ediciones[l]
          if (identificador_externo === undefined) continue
          const lanzador_id = yield* de(lanzador, l)
          edicion.set(`${k}/${l}`, yield* idDe('edicion_juego', { juego_id, lanzador_id }, { identificador_externo }))
        }
      }

      for (const p of perfiles) {
        const perfil = yield* asegurar(
          'perfil_configuracion',
          {
            edicion_id: yield* de(edicion, p.edicion.join('/')),
            distribucion_id: yield* de(distribucion, p.distribucion),
            version_capa_id: yield* de(capa, p.capa),
            arquitectura: 'x86_64',
            revision: 1,
          },
          {
            autor_id: yield* de(usuario, p.autor),
            titulo: p.titulo,
            ram_min_mb: p.ram_min_mb,
            vram_min_mb: p.vram_min_mb,
            requiere_vulkan: p.requiere_vulkan,
            version_vulkan_min: p.version_vulkan_min,
            parametros_lanzamiento: p.parametros_lanzamiento,
          },
        )
        if (!perfil.nuevo) continue
        for (const [i, [titulo, instruccion]] of p.pasos.entries()) {
          yield* sql`INSERT INTO paso_configuracion ${sql.insert({ perfil_id: perfil.id, orden: i + 1, titulo, instruccion })}`
          contar('paso_configuracion')
        }
        for (const d of p.dependencias) {
          const fila = { perfil_id: perfil.id, dependencia_id: yield* de(dependencia, d.dependencia), obligatoria: d.obligatoria, instruccion_instalacion: d.instruccion_instalacion }
          yield* sql`INSERT INTO perfil_dependencia ${sql.insert(fila)}`
          contar('perfil_dependencia')
        }
      }

      for (const g of guias)
        yield* idDe(
          'guia_adopcion',
          { titulo: g.titulo },
          {
            autor_id: yield* de(usuario, 'demo_revisor'),
            distribucion_id: g.distribucion === null ? null : yield* de(distribucion, g.distribucion),
            tipo: g.tipo,
            contenido: g.contenido,
            revision: 1,
            estado: 'publicada',
          },
        )
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
