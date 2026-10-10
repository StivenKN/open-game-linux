import { defineConfig } from 'vitest/config'

// Separate from vite.config.ts so tests don't boot the Start plugin (spike Q9).
export default defineConfig({ test: { include: ['src/**/*.test.ts', 'tests/**/*.test.ts'] } })
