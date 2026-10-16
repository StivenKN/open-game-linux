import { spawn } from 'node:child_process'
import { cpSync, createWriteStream, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import pg from 'pg'
import { type Browser, type BrowserContext, chromium } from 'playwright-core'

const FREEZE_AT = '2026-10-15T12:00:00Z'
const SEED_RANDOM = '42'
const ORIGIN = 'http://parity.test'
const PASSWORD = 'opengame-demo'
const ADMIN_URL = process.env.PARITY_PG_URL ?? 'postgres://opengame:opengame@localhost:55432/postgres'
const HARNESS = dirname(new URL(import.meta.url).pathname)

export const identities = {
  anonymous: null,
  demo_ana: 'demo_ana@demo.opengame.test',
  demo_revisor: 'demo_revisor@demo.opengame.test',
} as const
export type Identity = keyof typeof identities

const widths = [1280, 390] as const

export const routes = [
  '/',
  '/?q=elden',
  '/?estado=funciona&lanzador=1&sin_anti_cheat=true',
  '/entrar',
  '/entrar?volver=%2Frevision',
  '/registro',
  '/catalogo/nuevo',
  '/diagnostico',
  '/diagnostico?pegar=1',
  '/diagnostico/importar',
  '/guias',
  '/revision',
  '/revision?tipo=perfil',
  '/revision?tipo=solucion',
  '/_muestras',
  '/opengame-detect.sh',
  '/opengame-detect.ps1',
  ...[1, 2, 3, 4, 5, 6].flatMap((id) => [`/juegos/${id}`, `/perfiles/${id}`]),
  ...[1, 2, 3].map((id) => `/guias/${id}`),
  ...[1, 2, 3, 4, 5].map((id) => `/diagnosticos/${id}`),
  '/juegos/1/reportar',
  '/juegos/4/reportar?perfil=1',
  ...[1, 5, 8].map((id) => `/reportes/${id}/proton`),
  ...[4, 6, 7].map((id) => `/reportes/${id}/solucion`),
  '/reportes/4/solucion?tipoFallo=3',
] as const

export const slug = (route: string) => (route === '/' ? 'index' : route.slice(1).replace(/[^\w-]/g, '_'))
if (new Set(routes.map(slug)).size !== routes.length) throw new Error('two parity routes share a file name')

export type Source = { readonly kind: 'ref'; readonly sha: string } | { readonly kind: 'path'; readonly path: string }

export const parseSource = async (arg: string): Promise<Source> => {
  if (existsSync(arg)) return { kind: 'path', path: resolve(arg) }
  const sha = (await output('git', ['rev-parse', '--verify', `${arg}^{commit}`])).trim()
  return { kind: 'ref', sha }
}

export const capture = async (source: Source, out: string, label: string) => {
  const logs = join(out, 'logs')
  rmSync(join(out, 'captures'), { recursive: true, force: true })
  mkdirSync(logs, { recursive: true })
  const step = (message: string) => console.log(`[${label}] ${message}`)
  const app = mkdtempSync(join(tmpdir(), `opengame-parity-${label}-`))
  const database = `opengame_parity_${label}_${process.pid}`
  const port = await freePort()
  const env = {
    ...process.env,
    DATABASE_URL: new URL(database, ADMIN_URL).href,
    BETTER_AUTH_SECRET: 'parity-harness-secret-not-used-outside-throwaway-databases',
    BETTER_AUTH_URL: ORIGIN,
    PORT: String(port),
    TZ: 'UTC',
    FREEZE_AT,
    SEED_RANDOM,
  }
  const frozen = { ...env, NODE_OPTIONS: `--import=${join(HARNESS, 'determinism.mjs')}` }

  try {
    step(`copy ${source.kind === 'ref' ? source.sha.slice(0, 12) : source.path} to ${app}`)
    await materialize(source, app)
    step('install and build')
    await run('pnpm', ['install', '--frozen-lockfile', '--prefer-offline'], { cwd: app, env, log: join(logs, 'install.log') })
    await run('pnpm', ['run', 'build'], { cwd: app, env, log: join(logs, 'build.log') })

    await admin(`DROP DATABASE IF EXISTS ${database} WITH (FORCE)`)
    await admin(`CREATE DATABASE ${database}`)
    step(`migrate and seed ${database}`)
    await run('sh', ['-c', script(app, ['db:migrate', 'db:migrar'])], { cwd: app, env: frozen, log: join(logs, 'migrate.log') })
    await run('sh', ['-c', script(app, ['db:seed', 'db:sembrar'])], { cwd: app, env: frozen, log: join(logs, 'seed.log') })
    await pinTimes(env.DATABASE_URL)
    writeFileSync(join(out, 'frozen-literals.json'), `${JSON.stringify(await frozenLiterals(env.DATABASE_URL))}\n`)

    const server = spawn('sh', ['-c', `exec ${script(app, ['start'])}`], { cwd: app, env: frozen, detached: true, stdio: ['ignore', 'pipe', 'pipe'] })
    const serverLog = createWriteStream(join(logs, 'server.log'))
    server.stdout.pipe(serverLog)
    server.stderr.pipe(serverLog)
    const browser = await chromium.launch({ args: [`--host-resolver-rules=MAP parity.test 127.0.0.1:${port}`] })
    try {
      step(`serve on port ${port}`)
      await waitForServer(port, server)
      step('write flow')
      await writeFlow(browser, logs)
      await pinTimes(env.DATABASE_URL)
      step('capture')
      await captureAll(browser, port, join(out, 'captures'))
    } finally {
      await browser.close()
      // The built server stops listening on SIGTERM but never exits.
      if (server.pid !== undefined) process.kill(-server.pid, 'SIGKILL')
    }
  } finally {
    await admin(`DROP DATABASE IF EXISTS ${database} WITH (FORCE)`)
    rmSync(app, { recursive: true, force: true })
  }
}

const materialize = async (source: Source, dir: string) => {
  if (source.kind === 'ref') {
    await run('sh', ['-c', `git archive ${source.sha} | tar -x -C ${dir}`], {})
    return
  }
  const files = (await output('git', ['-C', source.path, 'ls-files', '-z', '--cached', '--others', '--exclude-standard'])).split('\0')
  for (const file of files) {
    const from = join(source.path, file)
    if (file === '' || !existsSync(from)) continue
    mkdirSync(dirname(join(dir, file)), { recursive: true })
    cpSync(from, join(dir, file))
  }
}

const script = (app: string, names: ReadonlyArray<string>) => {
  const { scripts }: { scripts: Record<string, string> } = JSON.parse(readFileSync(join(app, 'package.json'), 'utf8'))
  const found = names.find((n) => scripts[n] !== undefined)
  if (found === undefined) throw new Error(`package.json has none of ${names.join(', ')}`)
  return scripts[found]
}

const admin = async (statement: string) => {
  const client = new pg.Client({ connectionString: ADMIN_URL })
  await client.connect()
  try {
    await client.query(statement)
  } finally {
    await client.end()
  }
}

const pinTimes = async (databaseUrl: string) => {
  const client = new pg.Client({ connectionString: databaseUrl })
  await client.connect()
  try {
    await client.query(`SET parity.frozen = '${FREEZE_AT}'`)
    await client.query(readFileSync(join(HARNESS, 'pin-times.sql'), 'utf8'))
  } finally {
    await client.end()
  }
}

const frozenLiterals = async (databaseUrl: string) => {
  const client = new pg.Client({ connectionString: databaseUrl })
  await client.connect()
  try {
    const { rows } = await client.query<{ def: string }>(
      `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE contype = 'c' AND connamespace = 'public'::regnamespace`,
    )
    const literals = rows.flatMap(({ def }) => [...def.matchAll(/'((?:[^']|'')*)'/g)].map((m) => m[1].replaceAll("''", "'")))
    return [...new Set(literals)].filter((l) => l !== '').sort()
  } finally {
    await client.end()
  }
}

const signIn = async (context: BrowserContext, email: string) => {
  const page = await context.newPage()
  await page.goto(`${ORIGIN}/entrar`)
  const response = await page.evaluate(
    async ([email, password]) => {
      const r = await fetch('/api/auth/sign-in/email', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) })
      return `${r.status}\n${await r.text()}\n`
    },
    [email, PASSWORD] as const,
  )
  await page.close()
  if (!response.startsWith('200')) throw new Error(`sign-in as ${email} failed: ${response}`)
  return response
}

const newContext = async (browser: Browser) => {
  const context = await browser.newContext({ locale: 'es-CO', timezoneId: 'America/Bogota', deviceScaleFactor: 1, reducedMotion: 'reduce' })
  await context.clock.setFixedTime(FREEZE_AT)
  return context
}

const NOTE = 'Reporte del arnés de paridad.'

const writeFlow = async (browser: Browser, logs: string) => {
  const ana = await newContext(browser)
  await signIn(ana, identities.demo_ana)
  const form = await ana.newPage()
  const reviewer = await newContext(browser)
  await signIn(reviewer, identities.demo_revisor)
  const queue = await reviewer.newPage()
  try {
    await form.goto(`${ORIGIN}/juegos/1/reportar`, { waitUntil: 'networkidle' })
    await form.getByLabel('Versión o build del juego').fill('1.0.3179')
    await form.getByLabel('Fecha y hora de la prueba').fill('2026-10-14T20:00')
    await form.getByLabel('Observaciones').fill(NOTE)
    await form.getByRole('button', { name: 'Enviar reporte' }).click()
    await form.getByRole('heading', { name: 'Reporte enviado' }).waitFor({ timeout: 10_000 })

    await queue.goto(`${ORIGIN}/revision`, { waitUntil: 'networkidle' })
    const item = queue.locator('article').filter({ hasText: NOTE })
    await item.getByLabel('Motivo').fill('Reproducido por el arnés de paridad.')
    await item.getByLabel('Evidencia (para aprobar)').fill('Captura del arnés de paridad.')
    await item.getByRole('button', { name: 'Aprobar' }).click()
    await queue.locator('article').filter({ hasText: NOTE }).getByRole('button', { name: 'Retirar' }).waitFor({ timeout: 10_000 })
  } catch (e) {
    const page = queue.url() === 'about:blank' ? form : queue
    await page.screenshot({ path: join(logs, 'write-flow.png'), fullPage: true })
    throw e
  } finally {
    await ana.close()
    await reviewer.close()
  }
}

const captureAll = async (browser: Browser, port: number, dir: string) => {
  for (const [identity, email] of Object.entries(identities)) {
    const into = join(dir, identity)
    mkdirSync(into, { recursive: true })
    const context = await newContext(browser)
    if (email !== null) writeFileSync(join(into, 'signin.json'), await signIn(context, email))
    const cookie = (await context.cookies(ORIGIN)).map((c) => `${c.name}=${c.value}`).join('; ')
    const page = await context.newPage()
    for (const route of routes) {
      const name = join(into, slug(route))
      const r = await rawGet(port, route, cookie)
      writeFileSync(`${name}.response`, `${r.status}\n${r.location}\n${r.contentType}\n`)
      if (!r.contentType.startsWith('text/html')) {
        writeFileSync(`${name}.body`, r.body)
        continue
      }
      writeFileSync(`${name}.html`, r.body)
      for (const width of widths) {
        await page.setViewportSize({ width, height: 800 })
        await page.goto(ORIGIN + route, { waitUntil: 'networkidle' })
        await page.evaluate(() => document.fonts.ready)
        await page.screenshot({ path: `${name}.${width}.png`, fullPage: true, animations: 'disabled', caret: 'hide' })
      }
    }
    await context.close()
  }
}

type Raw = { readonly status: number; readonly location: string; readonly contentType: string; readonly body: Buffer }

const rawGet = (port: number, path: string, cookie: string) =>
  new Promise<Raw>((done, fail) => {
    const headers = { host: new URL(ORIGIN).host, ...(cookie === '' ? {} : { cookie }) }
    http
      .get({ host: '127.0.0.1', port, path, headers }, (res) => {
        const chunks: Array<Buffer> = []
        res.on('data', (c: Buffer) => chunks.push(c))
        res.on('end', () =>
          done({ status: res.statusCode ?? 0, location: res.headers.location ?? '', contentType: res.headers['content-type'] ?? '', body: Buffer.concat(chunks) }),
        )
      })
      .on('error', fail)
  })

const waitForServer = async (port: number, server: ReturnType<typeof spawn>) => {
  for (let tries = 0; tries < 300; tries++) {
    if (server.exitCode !== null) throw new Error(`server exited with code ${server.exitCode}`)
    const up = await rawGet(port, '/entrar', '').then(
      () => true,
      () => false,
    )
    if (up) return
    await new Promise((r) => setTimeout(r, 200))
  }
  throw new Error('server did not answer within 60 s')
}

const freePort = () =>
  new Promise<number>((done) => {
    const probe = createServer().listen(0, () => {
      const address = probe.address()
      probe.close(() => done(typeof address === 'object' && address !== null ? address.port : 0))
    })
  })

type RunOptions = { readonly cwd?: string; readonly env?: NodeJS.ProcessEnv; readonly log?: string }

const run = (command: string, args: ReadonlyArray<string>, { cwd, env, log }: RunOptions) =>
  new Promise<void>((done, fail) => {
    const child = spawn(command, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] })
    const sink = log === undefined ? process.stderr : createWriteStream(log)
    child.stdout.pipe(sink)
    child.stderr.pipe(sink)
    child.on('close', (code) => (code === 0 ? done() : fail(new Error(`${command} ${args.join(' ')} exited with ${code}${log === undefined ? '' : `, see ${log}`}`))))
  })

const output = (command: string, args: ReadonlyArray<string>) =>
  new Promise<string>((done, fail) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'inherit'] })
    const chunks: Array<Buffer> = []
    child.stdout.on('data', (c: Buffer) => chunks.push(c))
    child.on('close', (code) => (code === 0 ? done(Buffer.concat(chunks).toString('utf8')) : fail(new Error(`${command} ${args.join(' ')} exited with ${code}`))))
  })
