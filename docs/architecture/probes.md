# U0 probes

Three probes from `PLAN.md` row U0, run on 2026-10-10 against the pinned stack (Effect 4.0.2, `@effect/sql-pg` 4.0.2, better-auth 1.7.7, `pg` 8.23.1) and the local `opengame-pg` container (PostgreSQL 18.6). They took about 30 minutes of the 2-hour cap. Each script stays in `scripts/probes/` and runs again with the command in its header. `pnpm check` typechecks and lints them but does not run them.

| Probe | Question | Result | Decision |
|---|---|---|---|
| (a) `probe-form.ts` | Does `Schema.fromFormData(Schema.toCodecStringTree(NewReport))` decode the report form? | Yes, with two form conventions | Keep the direct path. No fallback |
| (b) `probe-auth.ts` | Does better-auth honor every `usuario` mapping? | Yes, in the DDL and at sign-up | Keep the mapping. No camelCase fallback |
| (c) `probe-types.ts` | Which JS value does `@effect/sql-pg` return per column type? | `numeric` is a string, `count(*)` is a bigint | The sketch's Schemas stand. Queries cast counts to `int` |

## (a) Form decode

**Setup.** The probe uses the real `NewReport` from `src/domain/contributions.ts` rather than a stand-in, because the real schema is already in place. It builds a `FormData` with bracket keys (`failures[0][failure_type_id]`, `layer_version[_tag]`, `measurement[avg_fps]`) and validates it through `Schema.toStandardSchemaV1`, which reports issue paths the way the form hook will read them.

**Observed** on 2026-10-10, before the English rename, so the output shows the Spanish field names.

```
## perfil_id "" y medicion ""
issue at ["perfil_id"]: Expected a string representing a finite number
issue at ["medicion"]: Expected "null" | object

## perfil_id y medicion ausentes
issue at ["perfil_id"]: Missing key
issue at ["medicion"]: Missing key

## perfil_id "null" y medicion "null" (nulo canónico de StringTree)
{ edicion_id: 1, diagnostico_id: 2, version_capa: { _tag: 'existente', id: 3 }, perfil_id: null,
  version_juego: '1.0.3', version_lanzador: null, fecha_prueba: 2026-10-01T00:00:00.000Z,
  resultado: 'no_inicia', fallos: [ { tipo_fallo_id: 4, detalle: 'Pantalla negra al lanzar' },
  { tipo_fallo_id: 5, detalle: 'Se cierra el lanzador' } ], medicion: null, observaciones: 'Probado dos veces' }

## version_capa nueva, perfil 7, medición completa
{ ..., version_capa: { _tag: 'nueva', familia: 'Proton', variante: 'GE', version: '9-20' }, perfil_id: 7,
  medicion: { fps_promedio: 61.5, resolucion: '1920x1080', calidad_grafica: 'alta', metodo_medicion: 'MangoHud' }, ... }

## funciona sin fallos, esquema del sketch
issue at ["fallos"]: Missing key

## funciona sin fallos, fallos con defecto []
{ ..., resultado: 'funciona', fallos: [], medicion: null, ... }

## no_inicia sin fallos, fallos con defecto [] (regla 8.7)
issue at []: regla 8.7: falta un tipo de fallo

## id no numérico
issue at ["version_capa","id"]: Expected a string representing a finite number

## texto opcional escrito "null"
{ ..., version_lanzador: null, ... }
```

**What works.** Nested arrays of structs, the `_tag` union, numeric ids from text, `RequiredText` trimming (`'  1.0.3  '` became `'1.0.3'`), `OptionalText` turning `''` into `null`, and `DateFromString`.

**What does not.** An empty `profile_id` does not mean null. The StringTree codec writes null as the literal string `"null"`, and only that string decodes to null. `""` fails, and an absent key fails. FormData also cannot express an empty array, so a report with no `failures` fails with `Missing key`.

**Decision.** Keep `fromFormData(toCodecStringTree(S))` in `ui/useAction.ts`. The fallback (a controlled form object plus `decodeUnknownResult`) is not needed. The forms and schemas follow three rules.

1. A nullable field posts `"null"` for "none". The profile select uses `<option value="null">Sin perfil</option>`. The FPS block posts a hidden `measurement=null` and disables it while the measurement inputs are on.
2. An array that a form can leave empty takes `Schema.withDecodingDefaultKey(Effect.succeed([]))` in its input schema. `NewReport.failures` needs it (lane B, U2). The server fn validator still accepts an explicit array.
3. The 8.7 filter reports at path `[]`, not `['failures']`. The sketch's `TODO(U2)` to attach it to `failures` is required, or the message has no field to land on.

**Side findings.**

- Rebuilding a Struct from `NewReport.fields` drops its `.check` filters. The probe's first version silently lost the 8.7 rule this way. This matters for the `domain/tables.ts` graft, where input Schemas spread row fields: restate the filters after a spread.
- A user who types the word `null` into a `OptionalText` field gets `null`. This is cosmetic and accepted.
- `DateFromString` reads `'2026-10-01'` as UTC midnight. In `America/Bogota` that renders as 30 September. U5 renders `tested_at` with `timeZone: 'UTC'`, or the column becomes `date`.

## (b) better-auth field mapping

**Setup.** better-auth 1.7.7 with `user: { modelName: 'usuario', fields: { name: 'alias', email: 'correo', createdAt: 'creado_en', updatedAt: 'actualizado_en', emailVerified: 'correo_verificado' }, additionalFields: { rol: { type: 'string', input: false, defaultValue: 'usuario' }, activo: { type: 'boolean', input: false, defaultValue: true } } }` on a `pg.Pool` to `opengame_test`. The probe prints `getMigrations()` and `compileMigrations()`, runs the migration, reads `information_schema`, signs up one user through `auth.api.signUpEmail`, and then drops the four tables.

**Observed.**

```
toBeCreated: [
  'usuario(alias, correo, correo_verificado, image, creado_en, actualizado_en, rol, activo)',
  'session(expiresAt, token, createdAt, updatedAt, ipAddress, userAgent, userId)',
  'account(accountId, providerId, userId, accessToken, refreshToken, idToken, accessTokenExpiresAt, refreshTokenExpiresAt, scope, password, createdAt, updatedAt)',
  'verification(identifier, value, expiresAt, createdAt, updatedAt)'
]

create table "usuario" ("id" text not null primary key, "alias" text not null, "correo" text not null unique,
  "correo_verificado" boolean not null, "image" text, "creado_en" timestamptz default CURRENT_TIMESTAMP not null,
  "actualizado_en" timestamptz default CURRENT_TIMESTAMP not null, "rol" text not null, "activo" boolean not null);
create table "session" (... "userId" text not null references "usuario" ("id") on delete cascade);
create table "account" (... "userId" text not null references "usuario" ("id") on delete cascade, ... "password" text, ...);
create table "verification" (...);
create index "session_userId_idx" on "session" ("userId");
create index "account_userId_idx" on "account" ("userId");
create index "verification_identifier_idx" on "verification" ("identifier");

-- signUpEmail user (JS names): { name: 'sonda', email: 'sonda@demo.opengame.test', emailVerified: false, image: null,
     createdAt: ..., updatedAt: ..., rol: 'usuario', activo: true, id: 'dRhOMPczGdPugTaRvgn904xO5id3WNED' }
-- usuario row: { id: 'dRhO…', alias: 'sonda', correo: 'sonda@demo.opengame.test', correo_verificado: false, image: null,
     creado_en: ..., actualizado_en: ..., rol: 'usuario', activo: true }
-- account row: [ { providerId: 'credential', password_len: 161 } ]
-- sign-up with rol=administrador: accepted, rol={... "rol":"usuario","activo":true ...}
```

**Result.** Every mapping holds in the DDL and in the rows that sign-up writes. The JS API keeps better-auth's names (`name`, `email`), as spike Q7 found. `input: false` holds twice. The typed `signUpEmail` body rejects a `rol` key at compile time (TS2769). At runtime, a body that carries `rol: 'administrador'` anyway is accepted, the field is ignored, and the row gets `usuario`.

**Decision.** Keep the mapping as written. The camelCase fallback is not needed. U1 and U3 inherit four facts.

- `image` is not mapped in this config and stays `image`. The sketch's `servidor/auth.ts` maps it to `imagen`, which is consistent with this result.
- `role` and `active` (then `rol` and `activo`) are `not null` with no DB default, because better-auth applies `defaultValue` in JS. A seeder that inserts into `app_user` directly must set both. U1 adds the `role` CHECK from `Role.literals`.
- `session`, `account` and `verification` keep camelCase columns (`userId`, `expiresAt`). These are better-auth's own tables, and the app does not query them.
- better-auth logs `Database schema mismatch` at startup while its tables are missing. The log is expected before `1_auth` runs.

## (c) Driver types

**Setup.** One `SELECT` of typed literals through `PgClient.layer` against PostgreSQL 18.6. The session time zone is `Etc/UTC` and the process time zone is `America/Bogota`. The probe ran a second time with `TZ=America/Bogota` set explicitly, with the same output.

**Observed** on 2026-10-10. The probe now names the last two Spanish aliases `text_array_empty` and `session_zone`.

```
integer            number 42
numeric_7_2        string "1234.50"
numeric_null       null
timestamptz        Date 2026-10-01T23:30:00.000Z
text_array         Array [string "pantalla_negra", string "sin_audio"]
text_array_vacio   Array []
boolean            boolean true
date               string "2026-10-01"
count_star         bigint "5n"
bigint             bigint "9007199254740993n"
zona_sesion        string "Etc/UTC"
process TZ         America/Bogota
```

**Decision.** The sketch's row Schemas are correct as written, so no Schema swap is needed.

- `integer` is a `number`. The branded `Schema.Int` ids hold.
- `numeric(7,2)` is a `string`. `ApprovedTest.avg_fps: Schema.NullOr(Schema.FiniteFromString)` is right. The sketch's "verify in U1" comment can go.
- `timestamptz` is a `Date`. `Schema.Date` holds for `tested_at` and `captured_at`.
- `text[]` is an array of strings. An empty array stays `[]`, but `array_agg` over zero rows is SQL `NULL`. The sketch already wraps it in `COALESCE(..., '{}')`.
- `boolean` is a `boolean`.
- `date` is a `'YYYY-MM-DD'` string, not a `Date`, so the type has no time zone trap. The schema has no `date` column today. If one appears, decode it with `Schema.String` or `DateFromString`, never `Schema.Date`.
- `count(*)` and `bigint` are JS `bigint`. A count that a Schema decodes as `number` must be cast in SQL (`count(*)::int`).
