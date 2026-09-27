import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { captureAttribution } from './utils/attribution'

// First-touch ?ref= / utm_* capture, before the router can redirect away from them.
captureAttribution()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
