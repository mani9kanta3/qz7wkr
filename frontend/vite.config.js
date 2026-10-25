import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    // recharts makes the bundle a bit big, this is fine for this app
    chunkSizeWarningLimit: 1000,
  },
  server: {
    port: 5173,
    // during local development send /api calls to the FastAPI server
    proxy: {
      '/api': 'http://localhost:8000',
    },
  },
})
