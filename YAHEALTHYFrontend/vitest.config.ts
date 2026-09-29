import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config'

// The tests run on the app's own Vite config (the React plugin, the @/ alias)
// plus what only tests need. This lives in its own file so that `vite` and
// `vite build` never load test settings, and the vite.config.js/.ts pair that
// AGENTS.md asks to keep in sync stays exactly as it was.
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      include: ['src/**/*.test.{ts,tsx}'],
      setupFiles: ['src/test/setup.ts'],
      // Every test states what the mocked API answers; nothing carries over.
      mockReset: true,
    },
  })
)
