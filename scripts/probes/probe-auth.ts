// Probe (b): does better-auth 1.7.7 honor every usuario mapping, in the DDL and at sign-up?
// Run: node --env-file=.env scripts/probes/probe-auth.ts   (touches only *_test; drops what it creates)
import { betterAuth } from 'better-auth'
import { getMigrations } from 'better-auth/db/migration'
import { Pool } from 'pg'

const url = process.env.DATABASE_URL_TEST
if (url === undefined || !new URL(url).pathname.endsWith('_test')) throw new Error('DATABASE_URL_TEST must name a *_test database')

const pool = new Pool({ connectionString: url, max: 2 })
const auth = betterAuth({
  baseURL: 'http://localhost:3000',
  secret: 'probe-secret-probe-secret-probe-secret-0123',
  database: pool,
  emailAndPassword: { enabled: true },
  user: {
    modelName: 'usuario',
    fields: { name: 'alias', email: 'correo', createdAt: 'creado_en', updatedAt: 'actualizado_en', emailVerified: 'correo_verificado' },
    additionalFields: {
      rol: { type: 'string', input: false, defaultValue: 'usuario' },
      activo: { type: 'boolean', input: false, defaultValue: true },
    },
  },
})

const tablas = ['session', 'account', 'verification', 'usuario']
const columnas = async (tabla: string) =>
  (
    await pool.query<{ column_name: string; data_type: string; is_nullable: string; column_default: string | null }>(
      `SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position`,
      [tabla],
    )
  ).rows

try {
  const { toBeCreated, toBeAdded, compileMigrations, runMigrations } = await getMigrations(auth.options)
  console.log('toBeCreated:', toBeCreated.map((t) => `${t.table}(${Object.keys(t.fields).join(', ')})`))
  console.log('toBeAdded:', toBeAdded.map((t) => t.table))
  console.log('\n-- compileMigrations()\n' + (await compileMigrations()))

  await runMigrations()
  console.log('\n-- information_schema after runMigrations()')
  for (const t of tablas) console.log(t, (await columnas(t)).map((c) => `${c.column_name} ${c.data_type}${c.is_nullable === 'NO' ? ' not null' : ''}${c.column_default === null ? '' : ` default ${c.column_default}`}`))

  const registro = await auth.api.signUpEmail({ body: { name: 'sonda', email: 'sonda@demo.opengame.test', password: 'contrasena-larga' } })
  console.log('\n-- signUpEmail user (JS names):', registro.user)
  console.log('-- usuario row:', (await pool.query('SELECT * FROM usuario')).rows)
  console.log('-- account row:', (await pool.query('SELECT "providerId", length(password) AS password_len FROM account')).rows)

  // The typed body rejects `rol` (input: false); a non-literal object skips that check to test the runtime.
  const cuerpoConRol = { name: 'colado', email: 'colado@demo.opengame.test', password: 'contrasena-larga', rol: 'administrador' }
  const intento = await auth.api
    .signUpEmail({ body: cuerpoConRol })
    .then((r) => `accepted, rol=${JSON.stringify(r.user)}`, (e: unknown) => `rejected: ${e instanceof Error ? e.message : String(e)}`)
  console.log('-- sign-up with rol=administrador:', intento)
} finally {
  for (const t of tablas) await pool.query(`DROP TABLE IF EXISTS "${t}" CASCADE`)
  await pool.end()
}
