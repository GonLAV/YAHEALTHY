import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

// Unit tests (`npm run test:unit`, files: src/**/*.test.ts(x)). Standalone on
// purpose: it shares only the React plugin and the `@/` alias with
// vite.config.{js,ts}, so the dev proxy and build plugins there never affect
// tests and this file never needs to be kept in sync with them.
// Tests default to the node environment; DOM tests opt in per file with a
// `// @vitest-environment jsdom` comment.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    environment: 'node',
    restoreMocks: true,
    unstubEnvs: true,
    unstubGlobals: true,
  },
})
