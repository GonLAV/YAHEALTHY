import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { captureAttribution } from './utils/attribution'
import { captureInstallPrompt, registerServiceWorker } from './pwa/pwa'
import { installGlobalErrorReporting } from './utils/errorReporting'
import { readStoredLang } from './i18n/LanguageContext'
import { alternatesFor, matchPublicRoute, normalizePath } from './seo/site'

// Uncaught errors and unhandled rejections → POST /api/client-errors (sampled, scrubbed).
installGlobalErrorReporting()

// First-touch ?ref= / utm_* capture, before the router can redirect away from them.
captureAttribution()

// Installable PWA: catch the install prompt before any page mounts, and
// register the service worker (offline shell, updates, push).
captureInstallPrompt()
registerServiceWorker()

const container = document.getElementById('root')!

const hasToken = () => {
  try {
    return Boolean(localStorage.getItem('token'))
  } catch {
    return false
  }
}

/**
 * Public pages ship prerendered HTML (scripts/prerender.mjs), stamped with the
 * path it was rendered for. Hydrate it only when this document really is that
 * page and the first client render will match it; otherwise start clean.
 */
const decideMount = (): 'hydrate' | 'render' => {
  const path = normalizePath(window.location.pathname)
  const match = matchPublicRoute(path)

  // A returning visitor opening the home page gets it in the language they
  // last used. Only the home page: a deep link (say, an English search result)
  // is honoured as-is. Crawlers have no saved preference, so they always see
  // the URL's own language.
  const preferred = readStoredLang()
  if (match?.kind === 'home' && preferred && preferred !== match.lang) {
    const target = alternatesFor(match)[preferred]
    window.history.replaceState(window.history.state, '', target + window.location.search + window.location.hash)
    return 'render'
  }

  const renderedFor = container.dataset.prerenderedPath
  if (!renderedFor || !container.hasChildNodes()) return 'render'
  if (renderedFor !== path) return 'render' // e.g. a host serving index.html as SPA fallback
  if (match?.kind === 'home' && hasToken()) return 'render' // signed in: redirects to /dashboard
  return 'hydrate'
}

const app = (
  <React.StrictMode>
    <App />
  </React.StrictMode>
)

if (decideMount() === 'hydrate') {
  ReactDOM.hydrateRoot(container, app)
} else {
  container.textContent = ''
  ReactDOM.createRoot(container).render(app)
}
