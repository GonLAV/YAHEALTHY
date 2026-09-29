import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import fs from 'fs'
import crypto from 'crypto'

// public/sw.js is hand-written and copied as-is, so on its own its bytes never
// change between deploys and browsers would never see an update. After the
// build, stamp it with a hash of the emitted (content-hashed) file names.
// Keep in sync with vite.config.js (Vite loads the .js first; `tsc -b` re-emits it from this file).
function swVersionPlugin(): Plugin {
  let outDir = 'dist'
  let names: string[] = []
  return {
    name: 'yahealthy-sw-version',
    apply: 'build',
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir)
    },
    generateBundle(_options, bundle) {
      names = Object.keys(bundle).sort()
    },
    closeBundle() {
      const file = path.join(outDir, 'sw.js')
      if (!fs.existsSync(file)) return
      const version = crypto.createHash('sha256').update(names.join('|')).digest('hex').slice(0, 12)
      const source = fs.readFileSync(file, 'utf8')
      fs.writeFileSync(file, source.replace("const SW_VERSION = 'dev';", `const SW_VERSION = '${version}';`))
    },
  }
}

export default defineConfig({
  plugins: [react(), swVersionPlugin()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: true,
    port: 5173,
    allowedHosts: true,
    proxy: {
      '/api': {
        target: process.env.VITE_PROXY_TARGET || 'http://localhost:5000',
        changeOrigin: true,
      },
      // Public share-card pages (/s/:token, /s/:token/card.svg|png) are rendered
      // by the backend so link scrapers get Open Graph tags. Regex key: a plain
      // '/s' prefix would also swallow /signup and /sleep.
      '^/s/': {
        target: process.env.VITE_PROXY_TARGET || 'http://localhost:5000',
        changeOrigin: true,
      }
    }
  }
})
