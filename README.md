<img src="assets/icon.svg" width="64" height="64" alt="">

# open-game-linux

Created in [T3 Code](https://t3.codes).

## Local database

The app and its tests use the PostgreSQL 18 container in `compose.yaml` on port 55432.

1. Copy `.env.example` to `.env`. `DATABASE_URL` is the dev database, and `DATABASE_URL_TEST` must name a database ending in `_test`.
2. Run `pnpm db:up` to start the container.
3. Run `pnpm db:migrar` to apply the migrations. A second run applies nothing.

`pnpm check` runs the schema tests in `tests/`, so it needs the container. The test setup empties and migrates `DATABASE_URL_TEST` once per run. `pnpm db:reset <base>` empties and migrates `DATABASE_URL`, and only when `<base>` is the name of that database.
