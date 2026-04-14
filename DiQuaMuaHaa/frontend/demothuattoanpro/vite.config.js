import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'

// basicSsl chỉ dùng khi dev local (LAN) — trên Vercel/Render đã có HTTPS sẵn
const isDev = process.env.NODE_ENV !== 'production'

export default defineConfig({
  plugins: isDev ? [react(), basicSsl()] : [react()],
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'http://127.0.0.1:8000',
        ws: true,
        changeOrigin: true,
      },
      '/api-medical': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api-medical/, ''),
      },
    },
  },
})
