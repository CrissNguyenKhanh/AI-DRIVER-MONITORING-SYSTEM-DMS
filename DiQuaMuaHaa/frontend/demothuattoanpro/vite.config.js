import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'

// HTTPS: camera (getUserMedia) chỉ hoạt động trên secure context (HTTPS hoặc localhost).
// http://IP-LAN bị trình duyệt chặn → không có mediaDevices, không hiện prompt Allow.
// Proxy /api và /socket.io → Flask :8000; /api-medical → len.py :5000 (tránh mixed content).
export default defineConfig({
  plugins: [react(), basicSsl()],
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
