import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: 'localhost',
    port: 5173,
    open: true,
  },
  preview: {
    host: 'localhost',
    port: 4173,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    target: 'esnext',
  },
  optimizeDeps: {
    exclude: ['@aztec/bb.js'],
  },
  worker: {
    format: 'es',
  },
})
