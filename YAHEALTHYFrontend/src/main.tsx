import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { captureAttribution } from './utils/attribution'
import { captureInstallPrompt, registerServiceWorker } from './pwa/pwa'

// First-touch ?ref= / utm_* capture, before the router can redirect away from them.
captureAttribution()

// Installable PWA: catch the install prompt before any page mounts, and
// register the service worker (offline shell, updates, push).
captureInstallPrompt()
registerServiceWorker()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
