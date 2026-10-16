# Glossary

The interface is in Spanish and the code is in English. Players read and type Spanish words: "Funciona con ajustes", "Perfil de configuración", `/juegos/12`. The code names the same things in English: `status`, `profile`, `$gameId`. The Terms table below maps each Spanish domain term to the English name the code uses for it, so you can go from a word on screen to its code.

A Spanish word can have more than one English name, one for each sense. A semicolon separates the senses, and the note in parentheses says where each one applies. Some notes name an old Spanish identifier, such as `FalloDominio`, to show which sense it had. Those old names no longer exist in the code.

## Frozen contracts

Some Spanish names are not code identifiers. They are contracts with players, with detector copies already downloaded, or with stored data, and they stay Spanish. Renaming one breaks something outside the code.

| Contract | Examples | Why it stays |
|---|---|---|
| URL paths | `/juegos/12`, `/perfiles/3`, `/diagnostico/importar`, `/reportes/10/solucion` | TanStack Router builds URLs from route file names, so the route files keep their Spanish names. Bookmarks, shared links and the detector link point at them. Route param names such as `$gameId` never reach the URL, so they are English. |
| Search keys and values | `q`, `estado`, `lanzador`, `sin_anti_cheat`, `volver`, `tipo`, `pegar`, `perfil`, `tipoFallo` | They are part of URLs that players share and bookmark. |
| Detector payload keys and values | `capturado_en`, `distribucion`, `biblioteca_steam`, `soporte_vulkan`, `desconocido` | Copies of the detector script that players already downloaded keep sending them. The `/diagnostico/importar#d=` link baked into the scripts and the `OPENGAME_*` environment variables stay for the same reason. |
| Stored data values | CHECK values such as `pendiente`, `funciona` and `revisor`, `_tag` values, the `nombre` key of each game in the `steam_library` jsonb | They are rows in a deployed database, not names in code. Changing them needs a data migration. |
| Storage keys | `opengame:diagnostico-pendiente`, `opengame:perfil:<id>:r<revision>:pasos` | A browser that saved state under the old key would lose it. |
| Auth fields | the session fields `rol` and `activo`, the `DOMINIO_RESERVADO` error code | better-auth sends them to the browser in its session and error JSON. Their database columns are `role` and `active`. |
| Docker volume | `datos` | Renaming the volume orphans a deployed database. |

UI copy, Spanish test titles, and `docs/architecture/sketch/` and `prototypes/` (historical records) also keep their Spanish text.

## Terms

| Spanish | English in code |
|---|---|
| accion | action (`runAction` runs a write in a transaction) |
| activo | active (the `app_user` column; the session field activo stays) |
| alternar | toggle |
| anidados | nested |
| anotar | note |
| antes | before (the previous role in `assignRole`) |
| aporte | contribution (domain); the `server/aportes` directory became commands |
| aprobados | approved |
| arranque_seguro | secure boot |
| arreglo | fix (an upstream umu-protonfixes fix); array (`elementosDeArreglo`, a JSON array in `server/external/protondb.ts`) |
| arte | artwork |
| autor | author |
| aviso | warning (GPU); notice (form message); listener (a store callback in `ui/progress.ts`) |
| azar | seeded random |
| biblioteca | library |
| bloqueo | blocker |
| buscar | search |
| busqueda | search |
| cabecera | header |
| calidad | quality |
| cambio | change |
| camino | render path (graphics); path (`RutaJuego.camino`, the chosen render path; a Schema issue path in `ui/useAction.ts`) |
| campo | field |
| capa | layer |
| captura | capture |
| casilla | checkbox |
| clave | key |
| codigo | code |
| cola | queue |
| como | via (distros); `asUser` and `asGuest` (test helpers that act as a session) |
| compartir | share |
| comprobacion | check |
| condicion | requirement |
| congelado | frozen |
| consulta | query |
| contar | count |
| contenido | content |
| conteos | counts |
| contrasena | password |
| controlador | driver |
| correo | email |
| creado | created |
| crear | create; sign up (`CrearCuenta`, the sign-up page) |
| cuenta | account (`FalloCuenta`); count (a tally: `doneCount`, total) |
| cuerpo | body |
| decidir | decide |
| dependencia | dependency |
| descartar | screen (distros) |
| destacado | featured |
| destino | destination; target (Destino in `diagnostico/importar.tsx`, where a diagnostic is saved) |
| detalle | detail |
| diagnostico | diagnostic |
| discrepancia | mismatch |
| distribucion | distribution |
| dominio | domain (the `_domain` CHECKs; DOMINIO_RESERVADO stays) |
| edicion | edition |
| ejecutar | run (`runStatements` in migrations; `runRead` and `runAction` in `server/run.ts`; run in `useAction`; `runScript` in `detector.test.ts`) |
| ejemplo | sample (demo data); demo (`SelloEjemplo`, the demo-data stamp; the ejemplo SQL alias and loader key) |
| elemento | element; item (a review queue item in `routes/revision.tsx`) |
| entorno | setup (a tested environment); env (a shell variable) |
| entrada | input; sign in (Entrada, the sign-in form schema in `routes/-account.ts`, from entrar) |
| entrar | sign in |
| enviar | submit |
| equipo | machine |
| errores | errors |
| esquema | schema |
| estado | status (domain); state (UI state such as `CopyBox` and `useState` pairs) |
| etiqueta | label |
| evaluar | evaluate |
| evidencia | evidence |
| exacta | exact |
| exigir | require |
| exportado | exported |
| externo | external |
| fallo | failure (a game compatibility failure); error (`Respuesta.fallo`, a reply that failed; `FalloDominio` is `DomainError`) |
| fallos.ts | errors (rule violations; `FalloDominio` is `DomainError`) |
| familia | family |
| fecha | date |
| ficha | game page; page (tests); `SampleCard` (the dev-only `/_muestras` gallery) |
| fijo | fixed |
| fila | row |
| filtro | filter |
| forma | shape |
| formato | format |
| formulario | form |
| frase | sentence |
| funcionales | working (`reportes_funcionales` is `working_reports`) |
| gestor | package manager |
| guardar | save |
| guia | guide |
| hay | found (the EXISTS alias in `review.ts`) |
| hecho | done |
| huella | fingerprint |
| icono | icon |
| identificador | id (`identificador_externo` is `external_id`) |
| importar | import |
| informe | report (upstream Proton report) |
| inmutable | immutable |
| insignia | badge |
| instruccion | instruction |
| juego | game |
| lanzador | launcher |
| largo | max length; `tooLong` and oversized (test inputs past a limit); length (the `_length` CHECKs) |
| leer | read; parse (`leerUrl`) |
| lienzo | canvas |
| limpiar | clean |
| lote | batch |
| manejo | handlers |
| marco | layout |
| matiz | hue |
| matriz | matrix |
| medicion | measurement |
| memoria | memory |
| mensaje | message |
| metodo | method |
| modesto | modest |
| momento | date and time |
| motivo | reason; motif (a cover-art pattern in `ui/cover-art.ts`) |
| muestra | sample (demo data) |
| nivel | level |
| nombre | name |
| normalizado | normalized |
| nota | note |
| nuevo | inserted (the diagnostic save flag and its CTE) |
| objecion | objection |
| obligatoria | required |
| observaciones | observations |
| oficial | official |
| omitido | skipped |
| opcion | option |
| opciones | options |
| orden | position (a profile step) |
| ordenadas | ordered |
| origen | origin (`contributions.ts`, `server/origin.ts`); source (`ReporteOrigen` and `FalloOrigen` in `form-options.ts`, the report a solution answers) |
| parametros_lanzamiento | launch options |
| paso | step |
| pegar | paste |
| pendiente | pending |
| perfil | profile |
| perfil_configuracion | profile |
| pestana | tab |
| politica | policy |
| portada | cover |
| posterior | after |
| previo | previous |
| probadas | tested |
| promedio | average; avg (the `avg_fps` column) |
| propietario | owner |
| propio | own (`es_propio` is `is_own`) |
| prueba | test (one approved test run); approved and context (test fixture locals) |
| rango | range; rank (`rangoVeredicto`) |
| reciente | recent |
| registrado | noted (`upstream_fix.noted_by` and `noted_at`; see registrar) |
| registrar | submit (a contribution); sign up (registrar in `routes/-account.ts`, a better-auth account); note (`RegistrarArreglo`, records a merged PR like `noteFix`) |
| regla | rule |
| regresion | regression |
| reiniciar | reset |
| reparto | breakdown |
| reporte | report |
| requisito | requirement |
| resultado | outcome; result (`ResultadoImportacion`) |
| resumen | summary |
| revisable | reviewable |
| revisado | reviewed |
| revision | review (`EstadoRevision`); revision number (`perfil.revision`) |
| revisor | reviewer |
| rol | role (the `app_user` column; the session field rol stays) |
| rotulo | caption |
| ruta | path (a graphics path to the GPU); route (`idDeRuta`, a router path param) |
| salida | kernel (distros: the kernel line a Kepler card stays on); spans (`codificarTramos` in `server/gpu/ranges.ts`); output (script output in `detector.test.ts`) |
| salir | sign out |
| sello | stamp |
| semilla | seed |
| separar | split |
| sistema | operating system (the diagnostic column `operating_system`); system (`hechosSistema`) |
| solucion | solution |
| soporte | support |
| texto | text; schema (the argument of `TextoOpcionalDe`) |
| tiene | has |
| tipo_fallo | failure type |
| titulo | title; heading id (`Elemento.titulo` in `routes/revision.tsx`) |
| tono | tone |
| total | total |
| tramo | span (a run of consecutive PCI ids) |
| trazo | stroke |
| trozo | chunk |
| ultimo | latest |
| usuario | user; `app_user` (the table, because user is reserved in Postgres) |
| vacio | blank (the `_not_blank` CHECKs) |
| variante | variant |
| veredicto | verdict; `rankOf` (`sugerirPerfil.veredicto`, a verdict rank) |
| verificado | verified |
| version_capa | layer version |
| vigencia | recency window |
| vigente | recent (inside the window); active (`estadosVigentes`) |
| visitante | visitor |
| volver | return to (the search key volver stays) |
