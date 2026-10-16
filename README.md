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

## Import ProtonDB data

A game's page can also show aggregate numbers from [ProtonDB](https://www.protondb.com), in their own section. They never change the state that OpenGame computes from approved reports. ProtonDB publishes a monthly export at [github.com/bdefore/protondb-data](https://github.com/bdefore/protondb-data): one `reports/reports_<month><day>_<year>.tar.gz` file holding a single `reports_piiremoved.json`.

1. Download the newest export from the `reports/` folder of that repository.
2. Import it. The command reads the JSON from standard input when the argument is `-`, so the archive never needs to be extracted to disk.

   ```sh
   tar -xzOf reports_oct1_2026.tar.gz | pnpm db:protondb -
   ```

   You can also pass the path of an extracted `reports_piiremoved.json`.

The import keeps one row of counts per catalog game with a Steam edition, matched by the edition's store identifier (the Steam appId). It stores no individual report. It reads the whole file before it changes the database, then replaces the previous import in one transaction. Importing the same export again leaves the same rows. An empty or truncated file, or an export older than the one already imported, fails and changes nothing. "Last year" on the page means the 12 months before the export's newest report.

Run the import again after a reviewer adds a game with a Steam edition, so that the new game gets its row.

The data is licensed under the [Open Database License (ODbL) 1.0](https://opendatacommons.org/licenses/odbl/). Every page that shows it carries the attribution "Datos de ProtonDB, licencia ODbL" with links to ProtonDB and the license. The license's share-alike terms apply if you publish a database derived from it.

With the plain Docker deployment below, pipe the archive into the running `app` container. The `-T` flag lets standard input through.

```sh
tar -xzOf reports_oct1_2026.tar.gz | docker compose -p opengame-prod --env-file .env.prod -f compose.prod.yaml -f compose.local.yaml exec -T app pnpm db:protondb -
```

## Run the detector

The detector reads the hardware and the installed Steam games, without root or admin rights. It opens the app's import page with the result in the URL fragment. Nothing is saved until you choose to save it, and the Steam game list is saved only if you check its box.

On Linux, run the Bash script with `--open`.

```sh
curl -fsSL http://localhost:3000/opengame-detect.sh | bash -s -- --open
```

To print the URL instead of opening a browser, set `OPENGAME_DRY=1`.

```sh
curl -s http://localhost:3000/opengame-detect.sh | OPENGAME_DRY=1 bash -s -- --open
```

On Windows 10 or 11, run the PowerShell script in a PowerShell window.

```powershell
irm http://localhost:3000/opengame-detect.ps1 | iex
```

To read the script before you run it, download <http://localhost:3000/opengame-detect.ps1> (the page links it as "Descargar opengame-detect.ps1"), then run the file.

```powershell
powershell -ExecutionPolicy Bypass -File .\opengame-detect.ps1
```

If the result is too long for a URL, the Windows script copies it to the clipboard and opens `/diagnostico?pegar=1`, where you paste it. The Linux script prints it for you to paste instead. Both scripts accept `OPENGAME_DRY=1`.

The `/diagnostico` page shows both commands, and it also accepts the pasted output or a manual form.

## Update the GPU table

The diagnosis projects what a GPU can do on Linux from its PCI id. The id table, `src/servidor/gpu/familias.generado.ts`, is generated from pinned Mesa, Linux and pci.ids sources. Do not edit it by hand.

To recognize newer GPUs, bump the pins in `scripts/generar-gpus.ts`, then regenerate the table. Review the printed counts and the diff before you commit.

```sh
pnpm gpu:generar
```

The run downloads the sources and fails if a source has a line or a chip it cannot read, or fewer ids than expected.

## Check

```sh
pnpm check
```

This runs route generation, `tsc`, oxlint, Vitest, `vite build` and a guard that keeps server code out of the browser bundle. The tests in `tests/` need the database container. They empty and migrate `DATABASE_URL_TEST` once per run. The PowerShell detector tests need `pwsh` on the `PATH` or Docker with the `mcr.microsoft.com/powershell` image pulled. Without either, Vitest skips them and names the reason.

## Parity harness

The parity harness proves that a change leaves everything a player sees and sends exactly as it was. It builds two versions of the app, gives each its own database, and compares what each one serves.

1. Start the database container with `pnpm db:up`.
2. Install the browser that the harness uses. Run this command once per machine.

   ```sh
   pnpm exec playwright-core install chromium-headless-shell
   ```

3. Compare your working tree, uncommitted edits included, with a base commit.

   ```sh
   pnpm parity compare --base abde5bf
   ```

`--head` takes a git ref or a directory, and the default is the current directory. `--base` takes the same values. Each side runs in a temporary copy, with its own database named `opengame_parity_*` and its own port. The harness deletes both when the run ends.

Each side seeds its database with a frozen clock and seeded randomness. Then `demo_ana` files a report and `demo_revisor` approves it. The harness requests every route in `scripts/parity/capture.ts` as an anonymous visitor, as `demo_ana` and as `demo_revisor`. It saves the following:

- The status, the `Location` header and the content type.
- The HTML, or the body of a response that is not HTML, such as the two detector scripts.
- Full-page screenshots at 1280 px and 390 px wide.
- The sign-in JSON.

The comparison passes only when every check below passes:

- Screenshots are identical pixel for pixel. ImageMagick measures a pair whose files differ.
- The HTML is byte-identical after the harness removes every `<script>` element and replaces `/assets/` file names. For each pair of names in `scripts/parity/markup-map.json`, the harness changes the new name in the head's tags back to the old name.
- The router data in the page has the same values in the same order, with the same number of object keys. The key names can differ.
- Every other file is byte-identical.

The command prints one block for each difference, then one line like `parity: 0 differences across 506 captures`. It exits with 1 if it finds a difference. The output directory keeps both captures, the logs, and a diff image for each screenshot that differs. To capture a side once and reuse it, run `pnpm parity capture --ref <ref> --out <dir>`, then pass that directory as `--base` or `--head`.

## Production

```sh
pnpm build
pnpm start
```

`pnpm build` produces a Node server in `.output/`, built by Nitro. `pnpm start` runs it on port 3000 and reads `.env`; variables already set in the environment win. Set `PORT` to use another port, and set `BETTER_AUTH_URL` to the public address, because sign-in accepts only requests from that origin and the detector command is built from it. Extra origins go in `BETTER_AUTH_TRUSTED_ORIGINS`, comma-separated.

## Deploy on a VPS

`compose.prod.yaml` runs the app and PostgreSQL 18 in Docker. The `app` container applies pending migrations on every start, then serves on port 3000. Neither container publishes a port to the host, so a reverse proxy must front the app. The database lives in the `datos` volume.

The stack reads four variables, listed in `.env.prod.example`:

- `POSTGRES_PASSWORD`. Use `openssl rand -hex 32`, because the app puts it in a database URL.
- `BETTER_AUTH_SECRET`. Use `openssl rand -base64 32`.
- `BETTER_AUTH_URL`. The public https address, for example `https://opengame.example.com`. Sign-in accepts only this origin, and the detector command is built from it.
- `BETTER_AUTH_TRUSTED_ORIGINS`. Optional extra origins, comma-separated.

### Coolify

1. In Coolify, select New Resource, then Public Repository, and enter `https://github.com/StivenKN/open-game-linux`. Select the branch.
2. Set Build Pack to Docker Compose and the compose location to `/compose.prod.yaml`.
3. In Environment Variables, fill in the variables above. Coolify blocks the deploy until the required ones have a value.
4. Set the domain of the `app` service to `https://<domain>:3000`. The `:3000` tells Coolify which container port receives the requests. You can also let Coolify generate an sslip.io domain. Set `BETTER_AUTH_URL` to the same https address, without the port.
5. Deploy.
6. Load the demo data once. Open the `app` container's Terminal tab in Coolify and run `pnpm db:sembrar`. Promote an account from the same terminal with `pnpm rol <correo> revisor`.

Every later deploy rebuilds the image and keeps the database.

### Plain Docker

1. Clone the repository on the server, copy `.env.prod.example` to `.env.prod`, and fill it in.
2. Publish the app on the loopback interface with a `compose.local.yaml` next to it:

   ```yaml
   services:
     app:
       ports: ["127.0.0.1:3000:3000"]
   ```

3. Start the stack, then load the demo data once. To update, run `git pull` and the first command again.

   ```sh
   docker compose -p opengame-prod --env-file .env.prod -f compose.prod.yaml -f compose.local.yaml up -d --build
   docker compose -p opengame-prod --env-file .env.prod -f compose.prod.yaml -f compose.local.yaml exec app pnpm db:sembrar
   ```

4. Serve it over https from the host's reverse proxy. With Caddy, the whole site entry is `opengame.example.com { reverse_proxy 127.0.0.1:3000 }`.

## Architecture

`docs/architecture/` holds the design. Start with `ARCHITECTURE.md`. `MODULES.md` maps the directories, `PLAN.md` lists the build units and cuts, `RATIONALE.md` records the decisions, and `cobertura.md` maps each requirement to its route, server program, tests and screenshots.
