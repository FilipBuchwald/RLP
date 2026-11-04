import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Frontend na :5173 (HMR), API (Pages Functions + D1) na :8788 przez `wrangler pages dev`.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:8788',
    },
  },
})
