import './index.css'
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { applyTheme, getStoredTheme } from './utils/theme'

// El tema se aplica antes del primer render para evitar el destello de tema
// claro en usuarios que tienen la app (o su sistema) en oscuro.
applyTheme(getStoredTheme())

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
