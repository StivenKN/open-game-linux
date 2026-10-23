# Glossary

The interface is in Spanish and English, and the code is in English. Players read Spanish words such as "Funciona con ajustes" and "Perfil de configuración" under `/es`, their English words under `/en`, and both type the same Spanish paths: `/es/juegos/12`, `/en/juegos/12`. The code names the same things in English: `status`, `profile`, `$gameId`. The Terms table below maps each Spanish domain term to the English name the code uses for it, so you can go from a word on screen to its code, and the Interface terms table maps the Spanish interface's words to the English interface's.

A Spanish word can have more than one English name, one for each sense. A semicolon separates the senses, and the note in parentheses says where each one applies. Every identifier in backticks in a note is a name the code uses today.

## Frozen contracts

Some Spanish names are not code identifiers. They are contracts with players, with detector copies already downloaded, or with stored data, and they stay Spanish. Renaming one breaks something outside the code.

| Contract | Examples | Why it stays |
|---|---|---|
| URL paths | `/juegos/12`, `/juegos/12/badge.svg`, `/perfiles/3`, `/diagnostico/importar`, `/reportes/10/solucion` | TanStack Router builds URLs from route file names, so the route files keep their Spanish names, under `/es` and `/en` alike. Bookmarks, shared links, badges embedded on other sites and the detector link point at them, and their unprefixed form still opens. Route param names such as `$gameId` never reach the URL, so they are English. |
| Language in the URL | the `/es` and `/en` prefixes, the `lang` cookie, `?lang=en` on `badge.svg` and `og.png` | Shared links name their language, the switcher's choice outlives the visit, and badges embedded on other sites ask for their language. |
| Search keys and values | `q`, `estado`, `lanzador`, `sin_anti_cheat`, `steam_deck`, `volver`, `tipo`, `pegar`, `perfil`, `tipoFallo`, `desde`, `titulo`, `pedido`, and report mode's `diagnostico`, `edicion` and `steam` | They are part of URLs that players share and bookmark. |
| Detector payload keys and values | `capturado_en`, `distribucion`, `biblioteca_steam`, `soporte_vulkan`, `desconocido`, `dispositivo`, and report mode's `juego` block (`herramienta`, `version_herramienta`, `opciones_lanzamiento`, `build`, `nativo`, `cuenta_supuesta`) | Copies of the detector script that players already downloaded keep sending them. The `/diagnostico/importar#d=` link baked into the scripts and the `OPENGAME_*` environment variables stay for the same reason. |
| Stored data values | CHECK values such as `pendiente`, `funciona` and `revisor`, `_tag` values, the `nombre` key of each game in the `steam_library` jsonb | They are rows in a deployed database, not names in code. Changing them needs a data migration. |
| Storage keys | `opengame:diagnostico-pendiente`, `opengame:perfil:<id>:r<revision>:pasos` | A browser that saved state under the old key would lose it. |
| Auth fields | the session fields `rol` and `activo`, the `DOMINIO_RESERVADO` and `CUENTA_DESACTIVADA` error codes | better-auth sends them to the browser in its session and error JSON. Their database columns are `role` and `active`. |
| Docker volume | `datos` | Renaming the volume orphans a deployed database. |

Spanish test titles, and `docs/architecture/sketch/` and `prototypes/` (historical records) also keep their Spanish text. Interface copy lives in the dictionaries, `src/ui/i18n/es/` and its English twin `src/ui/i18n/en/`.

## Terms

| Spanish | English in code |
|---|---|
| acceso | access (`Access`, `AccessChange` and `changeAccess`: an account's role and active flag) |
| accion | action (`runAction` runs a write in a transaction) |
| activo | active (the `app_user` column; the session field activo stays) |
| administrador | admin (`requireAdmin` and the `Admin` brand; the role value administrador stays) |
| alternar | toggle |
| anidados | nested |
| anotar | note |
| antes | before (an account's access before `changeAccess` applies a change) |
| aporte | contribution (domain; `myContributions` reads "Mis aportes"); commands (the `server/commands` directory of writes) |
| aprobados | approved |
| archivada | archived (a `GuideStatus`; the literal archivada stays) |
| arranque_seguro | secure boot |
| arreglo | fix (an upstream umu-protonfixes fix); array (`arrayElements`, a JSON array in `server/external/protondb.ts`) |
| arte | artwork |
| autor | author |
| aviso | warning (GPU); notice (form message); listener (a store callback in `ui/progress.ts`) |
| azar | seeded random |
| biblioteca | library |
| bloqueo | blocker |
| borrador | draft (`draftOf` and `ProfileDraft`, a profile's content to fill the form; a `GuideStatus`, where the literal borrador stays) |
| buscar | search |
| busqueda | search |
| cabecera | header |
| calidad | quality |
| cambio | change |
| camino | render path (graphics); path (`GamePath.path`, the chosen render path; a Schema issue path in `ui/useAction.ts`) |
| campo | field |
| capa | layer |
| captura | capture |
| casilla | checkbox |
| clave | key |
| codigo | code |
| cola | queue |
| como | via (distros); `asUser` and `asGuest` (test helpers that act as a session) |
| compartir | share (the ficha's "Compartir" block is `Embed`, its codes `embedCodes`) |
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
| crear | create; sign up (`SignUpPage`, the sign-up page) |
| cuenta | account (`AccountFailure`; `accounts`, the list on /admin/usuarios); count (a tally: `doneCount`, total) |
| cuerpo | body |
| cumplido | fulfilled (`fulfillRequests`; the request status cumplido stays) |
| decidir | decide |
| dependencia | dependency |
| descartar | screen (distros) |
| desde | from (the profile a new one starts from, `from` in `profileOptions`; the search key desde stays) |
| destacado | featured |
| destino | destination; target (`SaveTarget` in `routes/diagnostico/importar.tsx`, where a diagnostic is saved) |
| detalle | detail |
| diagnostico | diagnostic |
| discrepancia | mismatch |
| dispositivo | device (`diagnostic.device`, the Steam Deck model the detector reads from DMI) |
| distribucion | distribution |
| dominio | domain (the `_domain` CHECKs; DOMINIO_RESERVADO stays) |
| edicion | edition |
| editar | edit (`editProfile`, `editGuide`) |
| ejecutar | run (`runStatements` in migrations; `runRead` and `runAction` in `server/run.ts`; run in `useAction`; `runScript` in `detector.test.ts`) |
| ejemplo | sample (demo data); demo (`DemoStamp`, the demo-data stamp; the `demo` SQL alias and loader key) |
| elemento | element; item (a review queue item in `routes/revision.tsx`) |
| eliminar | delete (`deleteProfile`) |
| entorno | setup (a tested environment); env (a shell variable) |
| entrada | input; sign in (`SignIn`, the sign-in form schema in `routes/-account.ts`, from entrar) |
| entrar | sign in |
| enviado | sent (the `sent` date of an item in `routes/mis-aportes.tsx`) |
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
| fallo | failure (a game compatibility failure); error (`Reply.error`, a reply that failed; `DomainError`) |
| fallos.ts | errors (`domain/errors.ts`, rule violations raised as `DomainError`) |
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
| frenar | hold back (`holding_back`, the «Te frenan» list in `domain/readiness.ts`) |
| fuente | source (`ExternalSource`, the imported datasets; `UnreachableSource`, a GitHub request that failed, whose `_tag` stays `FuenteInalcanzable`) |
| funcionales | working (`working_reports`) |
| gestor | package manager |
| guardado | saved (`SavedMachines`) |
| guardar | save |
| guia | guide |
| hay | found (the EXISTS alias in `review.ts`) |
| herramienta | tool (the Steam compatibility tool, `SteamGame.tool`) |
| hecho | done |
| historial | history (`timeline` and `LayerHistory`, the ficha's "Historial por versión") |
| huella | fingerprint |
| icono | icon |
| identificador | id (`external_id`) |
| idioma | language (`Lang`, the `/$lang` segment of every page, the `lang` cookie; `localizedPath`, `withoutLang`) |
| importar | import |
| informe | report (upstream Proton report) |
| inmutable | immutable |
| insignia | badge (`badgeSvg`, the embeddable status badge at `/juegos/<id>/badge.svg`) |
| instruccion | instruction |
| juego | game; Steam game (`steam_game`, the report-mode block of the detector payload) |
| lanzador | launcher |
| largo | max length; `tooLong` and oversized (test inputs past a limit); length (the `_length` CHECKs) |
| leer | read; parse (`parseUrl`) |
| lienzo | canvas |
| limpiar | clean |
| lista | list (AreWeAntiCheatYet's `games.json`; `ListedGame`, one entry of it) |
| lote | batch |
| manejo | handlers |
| marco | layout |
| matiz | hue |
| matriz | matrix |
| medicion | measurement |
| memoria | memory |
| mensaje | message; `CheckMessage` (the code a Schema check carries, worded by each dictionary) |
| metodo | method |
| modesto | modest |
| momento | date and time |
| motivo | reason; motif (a cover-art pattern in `ui/cover-art.ts`) |
| muestra | sample (demo data) |
| nivel | level |
| nombre | name |
| normalizado | normalized |
| nota | note |
| novedades | news (`News`, `newsSince`: what a follower has not seen) |
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
| origen | origin (`contributions.ts`, `server/origin.ts`); source (`SourceReport` and `SourceFailure` in `form-options.ts`, the report a solution answers) |
| parametros_lanzamiento | launch options |
| paso | step |
| pedido | game request (`game_request`, `GameRequest`, `gameRequests`; the `/pedidos` URL and the `pedido` search key stay) |
| pedir | request (`requestGame`) |
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
| propio | own (`is_own`) |
| proponer | propose (`proposeProfile`) |
| prueba | test (one approved test run); approved and context (test fixture locals) |
| publicada | published (a `GuideStatus`, `published` in `server/queries/guides.ts`; the literal publicada stays) |
| rango | range; rank (`verdictRank`) |
| rechazar | reject (`rejectRequest`; the review decision Rechazar stays) |
| reciente | recent |
| registrado | noted (`upstream_fix.noted_by` and `noted_at`; see registrar) |
| registrar | submit (a contribution); sign up (`signUp` in `routes/-account.ts`, a better-auth account); note (`NoteFix`, the form that records a merged PR through `noteFix`) |
| regla | rule |
| regresion | regression |
| reiniciar | reset |
| rellenar | fill (`steamGame` fills the new-game form from the Steam store; `SteamLookup`) |
| reparto | breakdown |
| reporte | report |
| requisito | requirement |
| resultado | outcome; result (`ImportResult`) |
| resumen | summary |
| revisable | reviewable |
| revisado | reviewed |
| revision | review (`ReviewStatus`); revision number (a profile's `revision`) |
| revisor | reviewer |
| rol | role (the `app_user` column; the session field rol stays) |
| rotulo | caption |
| ruta | path (a graphics path to the GPU); route (`routeIdParser`, a router path param) |
| salida | kernel (distros: the kernel line a Kepler card stays on); spans (`encodeSpans` in `server/gpu/ranges.ts`); output (script output in `detector.test.ts`) |
| salir | sign out |
| seguidos | followed games (`myFollows`, the `/seguidos` page) |
| seguir | follow (`changeFollow`, the `game_follow` table) |
| sello | stamp |
| semilla | seed |
| separar | split |
| similitud | similarity (pg_trgm `word_similarity` in `catalog`) |
| sistema | operating system (the diagnostic column `operating_system`); system (`systemFacts`) |
| solucion | solution |
| soporte | support |
| sumarse | join (`RequestGame` with `_tag` existente) |
| supuesta | guessed (`guessed_account`: several Steam accounts and none marked as the last one used) |
| texto | text; schema (the argument of `OptionalTextOf`) |
| tiene | has |
| tienda | store (`SteamStoreRef`, a Steam store link or App ID) |
| tipo_fallo | failure type |
| titulo | title; heading id (`headingId` in `ReviewItem`, `routes/revision.tsx`) |
| tono | tone |
| total | total |
| tramo | span (a run of consecutive PCI ids) |
| trazo | stroke |
| trozo | chunk |
| ultimo | latest |
| usuario | user; `app_user` (the table, because user is reserved in Postgres) |
| vacio | blank (the `_not_blank` CHECKs) |
| variante | variant |
| veredicto | verdict; `rankOf` (a verdict rank in `suggestProfile`) |
| verificado | verified |
| version_capa | layer version |
| vigencia | recency window |
| vigente | recent (inside the window); active (`activeStatuses`) |
| visitante | visitor |
| vista previa | preview (`gamePreviewPng`, `sitePreviewPng` and `previewMeta`: the image and the tags a shared link unfurls with) |
| visto | seen (`seen_at`; "Marcar como visto" posts the `Visto` change) |
| volver | return to (the search key volver stays) |

## Interface terms

The English interface starts from the code's English names and keeps one word per concept. The words live in `src/ui/i18n/en/`; this table holds the ones a translator must keep consistent.

| Spanish interface | English interface |
|---|---|
| Sin evidencia verificada | No verified evidence |
| Funciona | Works |
| Funciona con ajustes | Works with tweaks |
| No inicia | Doesn't start |
| Falla en ejecución | Crashes in-game |
| Resultados variables | Mixed results |
| Sin confirmación en el último año | No confirmation in the last year |
| Pendiente de revisión, Aprobado, Rechazado, Retirado | Awaiting review, Approved, Rejected, Withdrawn |
| Catálogo, Inicio | Catalog, Home |
| ficha | game page |
| reporte (aprobado) | (approved) report |
| perfil de configuración | configuration profile |
| solución | solution |
| diagnóstico | diagnosis |
| equipo | machine |
| lanzador | launcher |
| distribución | distribution |
| aporte, Mis aportes | contribution, My contributions |
| Seguidos, Seguir, Dejar de seguir, Marcar como visto | Followed games, Follow, Unfollow, Mark as seen |
| novedades | news |
| pedido, Pídelo, Sumarme | request, Request it, Join |
| Revisión, revisor, administrador | Review, reviewer, administrator |
| Aprobar, Rechazar, Retirar | Approve, Reject, Withdraw |
| guía | guide |
| Entrar, Crear cuenta, Salir | Sign in, Create account, Sign out |
| Datos de ejemplo | Demo data |
| Compartir, insignia | Share, badge |
| Otras fuentes | Other sources |
| arreglo upstream | upstream fix |
