<img src="assets/icon.svg" width="64" height="64" alt="">

# open-game-linux

OpenGame Linux tells a player whether a Windows game runs on Linux, based only on community test reports that a reviewer approved. A visitor searches the catalog and opens a game's page to see its computed state and the environments that were tested. They can run a detector script to compare their computer with a game's known conditions, and follow a step-by-step configuration profile for Wine or Proton. Signed-in users report results and propose solutions. Reviewers approve reports, solutions and profiles before they count. The interface is in Spanish.

Created in [T3 Code](https://t3.codes).

## Prerequisites

- Node.js 24 (the scripts run TypeScript directly).
- pnpm.
- Docker with Compose, for the local PostgreSQL 18 container.

## Set up from zero

1. Install the dependencies.

   ```sh
   pnpm install
   ```

2. Copy `.env.example` to `.env`. `DATABASE_URL` is the dev database, and `DATABASE_URL_TEST` must name a database that ends in `_test`. Set `BETTER_AUTH_SECRET` to a long random string, for example the output of `openssl rand -base64 32`. `BETTER_AUTH_URL` is the address you open in the browser.
3. Start the database container. It listens on port 55432 and creates the `opengame` and `opengame_test` databases on first start.

   ```sh
   pnpm db:up
   ```

4. Apply the migrations. A second run applies nothing.

   ```sh
   pnpm db:migrar
   ```

5. Load the demo catalog, profiles, guides, accounts and reports. A second run adds nothing.

   ```sh
   pnpm db:sembrar
   ```

6. Start the dev server and open <http://localhost:3000>.

   ```sh
   pnpm dev
   ```

`pnpm db:reset <database>` empties and migrates the database in `DATABASE_URL`. It runs only when `<database>` is that database's name.

## Demo accounts

The seed creates four accounts. They all use the password `opengame-demo`.

| Account | Role |
|---|---|
| `demo_revisor@demo.opengame.test` | revisor |
| `demo_admin@demo.opengame.test` | administrador |
| `demo_ana@demo.opengame.test` | usuario |
| `demo_bruno@demo.opengame.test` | usuario |

Content written by these accounts shows the "Datos de ejemplo" stamp. You can also create your own account at `/registro`.

To change an account's role, run `pnpm rol <email> <usuario|revisor|administrador>`. The new role applies on the account's next request.

```sh
pnpm rol demo_ana@demo.opengame.test revisor
```

## Run the detector

The detector is a Bash script that reads the hardware without root. With `--open`, it opens the app's import page with the result in the URL fragment. Nothing is saved until you choose to save it.

```sh
curl -fsSL http://localhost:3000/opengame-detect.sh | bash -s -- --open
```

To print the URL instead of opening a browser, set `OPENGAME_DRY=1`.

```sh
curl -s http://localhost:3000/opengame-detect.sh | OPENGAME_DRY=1 bash -s -- --open
```

The `/diagnostico` page shows the same command, and it also accepts the pasted output or a manual form.

## Check

```sh
pnpm check
```

This runs route generation, `tsc`, oxlint, Vitest, `vite build` and a guard that keeps server code out of the browser bundle. The tests in `tests/` need the database container. They empty and migrate `DATABASE_URL_TEST` once per run.

## Production

```sh
pnpm build
pnpm start
```

`pnpm start` serves the build with `vite preview` on port 3000, like `pnpm dev`. It reads `.env` the same way `pnpm dev` does, and variables already set in the environment win. To use another port, run `pnpm start --port <port>` and set `BETTER_AUTH_URL` to match, because sign-in accepts only requests from that origin.

## Architecture

`docs/architecture/` holds the design. Start with `ARCHITECTURE.md`. `MODULES.md` maps the directories, `PLAN.md` lists the build units and cuts, `RATIONALE.md` records the decisions, and `cobertura.md` maps each requirement to its route, server program, tests and screenshots.
