import { existsSync } from 'node:fs'
import { defineConfig } from 'vite'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'

import viteReact from '@vitejs/plugin-react'
import { nitro } from 'nitro/vite'

// The SSR server reads DATABASE_URL and BETTER_AUTH_* from process.env, which Vite does not fill from
// .env. Variables already in the environment win (loadEnvFile does not override).
if (existsSync('.env')) process.loadEnvFile('.env')

// One default port for dev and the production preview; `pnpm dev --port N` overrides it. The Nitro server reads PORT.
const config = defineConfig({
  server: { port: 3000 },
  preview: { port: 3000 },
  resolve: { tsconfigPaths: true },
  plugins: [tanstackStart(), nitro(), viteReact()],
})

export default config
