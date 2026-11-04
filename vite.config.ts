import { cloudflare } from '@cloudflare/vite-plugin'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Plugin Cloudflare uruchamia Workera (worker/index.ts) i lokalną D1 w tym samym
// serwerze co frontend — `npm run dev` to jeden proces z HMR.
export default defineConfig({
  plugins: [react(), cloudflare()],
})
