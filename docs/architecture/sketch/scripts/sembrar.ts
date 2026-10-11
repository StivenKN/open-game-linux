// `pnpm db:sembrar` — demo data, all marked "Datos de ejemplo" (8.10: no invented results as fact).
//
// Lookups (lanzador, distribucion, version_capa, tipo_fallo, dependencia), juegos, ediciones,
// pending profiles with pasos/dependencias, and published guides are plain INSERTs.
// Accounts: auth.api.signUpEmail for demo_* users (alias demo_*, correo *@demo.opengame.test), then rol.
// Diagnoses, reports and solutions go through servidor/aportes/aportes.ts, and EVERY approval
// goes through decidir() (fronteras.test.ts forbids writing estado_revision here). So the seed
// replays the 8.10 recorrido and is itself proof that the rules admit the demo:
//   pending profile -> report using it -> approve report -> approve profile -> solution -> approve.
// Approved evidence comes only from the team's own runs; at least one game stays "Sin evidencia verificada".
// Idempotent: a second run is a no-op (checks a sentinel juego by titulo before inserting).
export {}
