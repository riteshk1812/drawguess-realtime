import path from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@drawguess/shared': path.resolve(__dirname, '../../packages/shared/src/index.ts'),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/socket.io': { target: 'http://127.0.0.1:3001', ws: true },
      '/api': { target: 'http://127.0.0.1:3001' },
    },
  },
})
