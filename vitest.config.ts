import { defineConfig } from 'vitest/config'

// Osobny config bez pluginu Cloudflare — testujemy czystą logikę z shared/.
export default defineConfig({
  test: {
    include: ['shared/**/*.test.ts'],
  },
})
