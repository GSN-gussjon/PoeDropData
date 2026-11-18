import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  root: `${root}src/renderer`,
  publicDir: `${root}public`,
  // GitHub Pages serwuje repozytoria pod /<nazwa-repo>/ — wartość ustawiana w CI.
  base: process.env.VITE_BASE_PATH || '/',
  plugins: [react()],
  build: {
    outDir: `${root}dist`,
    emptyOutDir: true
  }
})
