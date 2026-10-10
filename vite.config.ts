import { existsSync } from 'node:fs'
import { defineConfig } from 'vite'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'

import viteReact from '@vitejs/plugin-react'

// The SSR server reads DATABASE_URL and BETTER_AUTH_* from process.env, which Vite does not fill from
// .env. Variables already in the environment win (loadEnvFile does not override).
if (existsSync('.env')) process.loadEnvFile('.env')

const config = defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [tanstackStart(), viteReact()],
})

export default config
