import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

const frontendPort = parseInt(process.env.VITE_PORT ?? '1980')
const backendPort = parseInt(process.env.VITE_BACKEND_PORT ?? '1981')

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') }
  },
  server: {
    port: frontendPort,
    proxy: {
      '/api': `http://localhost:${backendPort}`
    }
  }
})
