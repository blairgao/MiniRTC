import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const backendTarget = process.env.BACKEND_TARGET ?? 'http://localhost:8000'

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    proxy: {
      '/api': backendTarget,
      '/ws': {
        target: backendTarget.replace(/^http/, 'ws'),
        ws: true,
        configure: (proxy) => {
          proxy.on('error', (err: NodeJS.ErrnoException) => {
            if (err.code !== 'EPIPE') console.error('ws proxy error:', err)
          })
        },
      },
    },
  },
})
