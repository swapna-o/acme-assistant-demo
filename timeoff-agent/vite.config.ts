import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  root: '.',
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3001',
      '/rag': { target: 'http://localhost:8930', rewrite: p => p.replace(/^\/rag/, '') },
    },
  },
  build: {
    outDir: 'dist/client',
  },
})
