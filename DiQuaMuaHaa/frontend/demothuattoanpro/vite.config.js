import { defineConfig, loadEnv } from 'vite'
import process from 'node:process'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'
import { resolveApiBase } from './src/config/resolveApiBase.js'

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  if (command === 'build') {
    resolveApiBase({ configured: env.VITE_API_BASE, development: false })
    if (env.VITE_MEDICAL_API_BASE) {
      resolveApiBase({ configured: env.VITE_MEDICAL_API_BASE, development: false, service: 'medical' })
    }
  }
  return {
    plugins: command === 'serve' ? [react(), basicSsl()] : [react()],
    server: {
      host: true,
      port: 5173,
      proxy: {
        // More-specific prefix first: /api-medical must not reach the DMS API.
        '/api-medical': {
          target: 'http://127.0.0.1:5000',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api-medical/, ''),
        },
        '/api': { target: 'http://127.0.0.1:8000', changeOrigin: true },
        '/health': { target: 'http://127.0.0.1:8000', changeOrigin: true },
        '/socket.io': { target: 'http://127.0.0.1:8000', ws: true, changeOrigin: true },
      },
    },
  }
})
