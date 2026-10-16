import { existsSync } from 'node:fs'
import { defineConfig } from 'vitest/config'

// Variables already in the environment win over .env (Node's loadEnvFile does not override).
if (existsSync('.env')) process.loadEnvFile('.env')

// Separate from vite.config.ts so tests don't boot the Start plugin (spike Q9).
// tests/ needs the local Postgres (`pnpm db:up`); its globalSetup migrates DATABASE_URL_TEST.
export default defineConfig({
  test: {
    projects: [
      { test: { name: 'dominio', include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'] } },
      {
        test: {
          name: 'bd',
          include: ['tests/**/*.test.ts'],
          globalSetup: ['tests/setup.ts'],
          // server/runtime.ts and server/auth.ts read DATABASE_URL; point them at the test database.
          // An empty value makes them fail instead of falling back to the dev database.
          env: { DATABASE_URL: process.env.DATABASE_URL_TEST ?? '' },
        },
      },
    ],
  },
})
