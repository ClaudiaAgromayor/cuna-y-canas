import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Los datos los genera el ETL en data/processed; la web los sirve tal cual (municipios.json, <cod>-<slug>/...).
// base relativa para que funcione igual en Oracle (raíz) que en GitHub Pages (subcarpeta).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  publicDir: '../data/processed',
  base: './',
  build: { chunkSizeWarningLimit: 1500 }, // MapLibre ocupa unos 800 KB por sí solo
})
