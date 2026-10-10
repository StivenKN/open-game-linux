# Stack spike findings: TanStack Start + Effect 4 + Postgres 18 + better-auth

Throwaway spike, 2026-10-10. Everything below is **observed** unless labeled *inferred*. App code lives next to this file; read it for the exact glue.

Resolved versions: `@tanstack/react-start` 1.168.61, `@tanstack/react-router` 1.170.42, `vite` 8.3.4, `react` 19.3.0, `typescript` 7.0.2, `effect` 4.0.2, `@effect/sql-pg` 4.0.2, `@effect/platform-node` 4.0.2, `@effect/vitest` 4.0.2, `vitest` 5.0.3, `better-auth` 1.7.7, `pg` 8.23.1, Postgres `postgres:18`, Node 24.21, pnpm 12.4.1.

## Effect 4 import map (copy these)

There is **no `effect/unstable/*`** in 4.0.2. The old `@effect/platform` and `@effect/sql` modules moved into `effect` subpaths:

| Need | Import |
|---|---|
| Core | `import { Effect, Layer, ManagedRuntime, Context, Schema, Exit, Option, Redacted, Data, Config, Result } from 'effect'` |
| SQL | `import { SqlClient, SqlSchema, SqlError, Migrator, Statement, SqlModel, SqlResolver } from 'effect/sql'` |
| HTTP | `import { HttpRouter, HttpServer, FetchHttpClient, HttpClient, HttpServerResponse } from 'effect/http'` |
| HttpApi | `import { HttpApi, HttpApiBuilder, HttpApiClient, HttpApiEndpoint, HttpApiGroup, HttpApiSchema, HttpApiError, HttpApiMiddleware, HttpApiSecurity, OpenApi } from 'effect/http-api'` |
| Schema extras | `import { Model, VariantSchema } from 'effect/schema'` |
| Postgres driver | `import { PgClient, PgMigrator } from '@effect/sql-pg'` |
| Node services | `import { NodeServices } from '@effect/platform-node'` (only needed for the migrator) |
| Tests | `import { describe, it, expect } from '@effect/vitest'` |

API names used and typechecked:
- `PgClient.layer({ url: Redacted.make(url) })` gives `Layer<PgClient | SqlClient, SqlError>`.
- `ManagedRuntime.make(layer)`, `runtime.runPromise`, `runtime.runPromiseExit`, `runtime.memoMap`.
- `Schema.TaggedError<Self>()('Tag', { ...fields })`, `Schema.Literals([...])`, `Schema.BigInt.pipe(Schema.brand('ReporteId'))`, `Schema.NullOr`, `Schema.BigIntFromString`, `Schema.Union([...])`, `Schema.encodeSync`, `Schema.decodeUnknownEffect`, `Schema.toStandardSchemaV1(schema)`.
- `SqlSchema.findAll({ Request, Result, execute })` and `SqlSchema.findOneOption(...)`. Each returns `(req) => Effect`.
- `Context.Service<Self, Shape>()('Key')` replaces v3's `Context.Tag`.
- `Option.fromNullishOr` (v4 name), `Exit.findErrorOption`, `Effect.catchTag(['SqlError', 'SchemaError'], Effect.die)` (array of tags works).

## Q1. Scaffold TanStack Start

**Observed.** The documented CLI is `npx @tanstack/cli@latest create`. Non-interactive form used:

    npx -y @tanstack/cli@latest create stack-spike --framework React --blank --package-manager pnpm --no-git --no-toolchain --no-intent --non-interactive

It takes 11.6 s. `pnpm build` passes in 2.2 s (client plus SSR environments). `pnpm dev` is ready in 462 ms. `pnpm preview` serves the production build with SSR, server functions, the HttpApi route and auth all working. The scaffold pins `typescript ^6.0.2`, `@types/node ^22`, `vite ^8.0.0`, `@vitejs/plugin-react ^6`, and `resolve: { tsconfigPaths: true }` with the `#/*` alias.

**Implication.** Start 1.168 on Vite 8 is stable enough to build on. The `--blank` template has no deployment adapter: `dist/server/server.js` exports a fetch handler, not a listening server. Pick Nitro (`--deployment nitro`) or a tiny srvx/node wrapper for production (*inferred*, not tried).

## Q2. TypeScript 7.0.2 strict

**Observed.** `npx tsc --noEmit` with `typescript@7.0.2` and the scaffold's `strict` tsconfig gives **0 errors** across Start, the router codegen (`routeTree.gen.ts`), Effect 4, better-auth and HttpApi, in about 1.0 s. `tsr generate` works with TS 7 installed.

**Implication.** Use TS 7.0.2. Keep `skipLibCheck: true` (scaffold default; strict without it was not tested).

## Q3. Effect inside a server function, and what a failure looks like to the caller

**Setup** (`src/server/db.ts`, `src/server/fns.ts`):
- One module-level `ManagedRuntime.make(PgLive)`.
- Validator `.validator(Schema.toStandardSchemaV1(Schema.Struct({ id: Schema.BigIntFromString })))`. In Start 1.168 `.validator` is current and `.inputValidator` is `@deprecated`.
- Types flow through Standard Schema. The caller passes the Encoded type (`{ id: string }`), the handler's `data` is the decoded Type (`{ id: bigint }`).
- The client bundle drops the validator and handler. Only `createClientRpc("<id>")` ships.

**Validation failure** (browser, `id: 'abc'`): the caller gets a plain `Error` whose `message` is a JSON array of Standard Schema issues, `[{"path":["id"],"message":"Expected a string representing a bigint"}]`.

**Variant A, throwing the domain error** (`runtime.runPromise` rejects with the `ReporteNoEncontrado` instance):

| Caller | What arrived |
|---|---|
| SSR loader (in-process) | real class instance, `_tag` and fields intact |
| Same error dehydrated into the HTML for hydration | `new Error("")`. Class, `_tag` and fields **lost** |
| Browser calling the server fn over HTTP | plain `Error`, empty message. **Lost** |

**Variant A plus a Start serialization adapter** (`src/start.ts`: `createStart(() => ({ serializationAdapters: [createSerializationAdapter({ key, test, toSerializable, fromSerializable })] }))`). After a dev-server restart the class is **preserved** on every path (HTTP and SSR dehydration).

**Variant B, returning a Result-shaped union** (`runPromiseExit`, then `{ ok: true, value } | { ok: false, error: Schema.encodeSync(Union)(e) }`). The browser receives `{"ok":false,"error":{"_tag":"ReporteNoEncontrado","id":99n}}` as a plain object. `bigint` survives the wire (seroval).

**Implication.** A thrown Effect error does not survive Start's wire by default. Pick one transport: a serialization adapter (per class or one generic adapter over a registry of TaggedError classes), or a returned typed union. Keep infra errors (`SqlError`, `SchemaError`) as thrown defects; only domain errors become data.

**Glue cost.** Runtime 10 lines once. Per server fn 1 line. Validator 1 line. Error adapter about 7 lines per class (about 10 for a generic registry, *inferred*). Result union about 6 lines per fn, or one shared helper.

## Q4. Route loader calling the server fn during SSR

**Observed.** `loader: () => listarReportesFn()`, then `curl -s localhost:3000/` shows the DB rows in the HTML (`<li data-id-type="bigint">Elden Ring en Proton 10 [aprobado]</li>...`). Same from the production build. Ids stay `bigint` through loader data.

## Q5. Postgres 18 migration, CHECK and trigger errors

**Observed.** `PgMigrator.run({ loader: Migrator.fromRecord({ '1_reporte': effect }) })` works (`scripts/migrate.ts`, `src/server/migrations.ts`).
- Requires `ChildProcessSpawner | FileSystem | Path` (optional `pg_dump`), so provide `NodeServices.layer`.
- Tracking table `effect_sql_migrations(migration_id, created_at, name)`. Second run logs `ran []`, so it is idempotent.
- One `sql.unsafe` call with several statements **fails** with `SqlSyntaxError` (extended protocol). One statement per call.

Violations triggered from Effect (`scripts/probe-violations.ts`):

    CHECK  : SqlError { reason: ConstraintError { cause: Error('new row for relation "reporte" violates check constraint "reporte_bloque_revision"')
             { code:'23514', constraint:'reporte_bloque_revision', table:'reporte' } } }
    TRIGGER: SqlError { reason: ConstraintError { cause: Error('reporte: el contenido no se reescribe; registre un aporte nuevo (id 1)')
             { code:'23514', constraint:'og_solo_revision' } } }

- `RAISE ... USING ERRCODE = 'check_violation', CONSTRAINT = 'og_solo_revision'` is classified as `ConstraintError` and exposes the constraint name.
- PG fields (`code`, `constraint`, `message`, `detail`) sit **untyped** on `error.reason.cause`; wrap the cast once.
- SqlError reason tags: `ConnectionError, AuthenticationError, AuthorizationError, SqlSyntaxError, UniqueViolation, ConstraintError, DeadlockError, SerializationError, LockTimeoutError, StatementTimeoutError, UnknownError`.

**Implication.** Port trigger functions with `USING ERRCODE = 'check_violation', CONSTRAINT = '<rule_name>'`, then one constraint-name to domain-error table maps every DB rule (`src/server/revision.ts`, about 10 lines).

## Q6. Decoding rows with Effect Schema

**Observed** (`scripts/probe-rows.ts`):
- `bigserial`/`int8` arrive as **JS `bigint`**. `Schema.Int` brand fails; `Schema.BigInt.pipe(Schema.brand('ReporteId'))` decodes.
- `estado_revision` decodes as the literal union.
- An out-of-union value fails the **whole query** with `SchemaError: Expected "pendiente" | "aprobado" | "rechazado" at [1]["estado_revision"]`.

**Implication.** Brand ids on `bigint`, or use `integer`/`uuid` ids. Keep CHECKs and Schemas generated from one literal list.

## Q7. better-auth 1.7.7 on Start with Postgres

**Observed** (`src/server/auth.ts`, `scripts/auth-migrate.ts`, `src/routes/api/auth/$.ts`):
- `user: { modelName: 'usuario', fields: { name: 'alias', email: 'correo' } }` works. The JS API still says `name`/`email`; the mapping is DB-only.
- `getMigrations(auth.options)` from `better-auth/db/migration` creates `usuario`, `session`, `account`, `verification`, camelCase columns, text ids.
- **The password hash lives in `account.password`** (`providerId = 'credential'`), not on the user table.
- **It cannot share a Pool with `@effect/sql-pg`** (native-protocol driver, no `pg`). They share the connection string only.
- Sign-up and sign-in work with curl at `/api/auth/$` (`server.handlers.GET/POST = ({ request }) => auth.handler(request)`). `tanstackStartCookies()` from `better-auth/tanstack-start`.
- In a server fn, `auth.api.getSession({ headers: getRequest().headers })` works (`getRequest` from `@tanstack/react-start/server`).
- In Effect, a per-request `class Sesion extends Context.Service<Sesion, AuthSession>()('Sesion')` provided with `Effect.provideService` works; without the cookie the program fails with `NoAutenticado`.

**Implication.** better-auth owns `usuario/session/account/verification`; domain tables FK to `usuario.id` (text). Two pools (auth's `pg.Pool` plus Effect's): budget connections. **Glue cost:** config 20, route 11, session-to-Effect bridge about 15 lines.

## Q8. HttpApi served from a Start catch-all route

**Observed: it works** (`src/api/contract.ts`, `src/api/server.ts`, `src/routes/api/$.ts`, `src/routes/api-probe.tsx`).
- `HttpApiBuilder.layer(Api)` plus group layer plus `[PgLive, HttpServer.layerServices]`, then `HttpRouter.toWebHandler(ApiLive, { memoMap: runtime.memoMap })` gives `{ handler, dispose }`.
- `/api/reportes/1` gives 200, `/api/reportes/99` gives `404 {"_tag":"ReporteNoEncontrado","id":"99"}` (via `.annotate({ httpApiStatus: 404 })`), `/api/reportes/abc` gives 400.
- `/api/auth/$` still wins over `/api/$`.
- Browser `HttpApiClient.make(Api, { baseUrl })` with `FetchHttpClient.layer`: typed error arrives as a **real class instance**; bigint round-trips.
- Pool shared via `memoMap`: one `@effect/sql-pg` connection after using both paths.
- Handlers requiring `SqlClient` per request fail to typecheck in `toWebHandler`; build the group as an `Effect.gen` that grabs `SqlClient` once.
- Client chunk for the probe route 41.9 kB (14.8 kB gzip) on top of shared Effect code.

**Implication.** A single-contract candidate (HttpApi for everything, Start only for SSR and routing) is viable, with typed errors on the client and OpenAPI. Cost: SSR loaders call the handler or client in-process (*inferred*). **Glue cost:** about 20 server, 11 route, 8 per client call site.

## Q9. @effect/vitest

**Observed.** `npx vitest run` passes 2 tests (plain and `it.effect`) in 339 ms. Mutating `bloqueRevisionValido` (dropping `.trim()`) turned it red. Uses a separate 4-line `vitest.config.ts` so the Start Vite plugin does not boot.

## Gotchas

1. **Effect satellites ahead of core.** `@effect/sql-pg`, `@effect/platform-node`, `@effect/vitest` 4.0.3 peer on unpublished `effect ^4.0.3` and crash at runtime. Pin the whole Effect family to 4.0.2 and override `'@effect/platform-node-shared': 4.0.2`.
2. **pnpm 12 `minimumReleaseAge`** rejects packages published within about a day. The `"pnpm"` field in `package.json` is ignored by pnpm 12; settings go in `pnpm-workspace.yaml`.
3. **Server-fn files leak their module scope to the client.** Module-level code in a `createServerFn` file stays in the client bundle; it pulled `pg` into the browser and crashed hydration (`Buffer is not defined`). Rule: a server-fn file holds only `createServerFn(...)` exports; programs, services and auth live in modules imported only by handlers.
4. Thrown domain errors become `new Error("")` on the client unless a serialization adapter is registered. In-process SSR hides this.
5. `int8` decodes as `bigint`; `JSON.stringify` throws on it.
6. Standard Schema validation errors arrive as `Error` with JSON in `message`, not structured.
7. `sql.unsafe` with several statements fails; one statement per call.
8. PG error fields are untyped on `SqlError.reason.cause`.
9. `src/start.ts` changes needed a dev-server restart (*inferred* HMR does not pick it up).
10. `HttpRouter.toWebHandler` logs every request; pass `disableLogger: true`.
11. A module-level `ManagedRuntime` may leak pools on HMR reloads (*inferred*); consider `import.meta.hot.dispose(() => runtime.dispose())`.
12. Node 24 runs `.ts` scripts directly; relative imports need the `.ts` extension; the `#/` alias probably does not resolve under plain Node (*inferred*).

## Glue cost summary

| Integration | Adapter lines |
|---|---|
| Effect runtime in Start | 10 once, plus 1 per server fn |
| Effect Schema as server-fn validator | 1 |
| Domain error over the server-fn wire | about 7 per class (adapter) or about 6 per fn (Result union) |
| PG CHECK/trigger to domain error | about 10 |
| Effect migrator script | about 10 |
| better-auth (config, route, session bridge) | 20 + 11 + 15 |
| HttpApi in a Start catch-all (server, route, client) | 20 + 11 + 8 |
| @effect/vitest | 4 |
