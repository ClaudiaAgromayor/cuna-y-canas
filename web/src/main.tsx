import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// solo en desarrollo: ?imprimir=municipio deja la página lista para sacar el PDF con un navegador sin ventana (revisión de las fichas)
if (import.meta.env.DEV) { const q = new URLSearchParams(location.search).get('imprimir'); if (q) document.body.dataset.imprimir = q }
// solo en desarrollo: ?sesion=065 abre la sesión de técnico de demostración (capturas para la presentación)
if (import.meta.env.DEV) { const c = new URLSearchParams(location.search).get('sesion'); if (c) localStorage.setItem('cyc_sesion', JSON.stringify({ organismo: 'Comunidad de Madrid', cod: c })) }

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
