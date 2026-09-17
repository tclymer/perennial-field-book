import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import './index.css'
import App from './App'
import { ErrorBoundary } from './ui/ErrorBoundary'
import { applyTheme, readTheme } from './ui/theme'

// Apply the saved theme before the first paint so the page does not flash light.
applyTheme(readTheme())

// HashRouter keeps deep links (and tree tags) working on static hosts.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <HashRouter>
        <App />
      </HashRouter>
    </ErrorBoundary>
  </StrictMode>,
)
