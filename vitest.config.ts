import { defineConfig } from 'vitest/config'

// Osobny config bez pluginu Cloudflare — testujemy czystą logikę (shared/) i auth Workera.
export default defineConfig({
  test: {
    include: ['shared/**/*.test.ts', 'worker/**/*.test.ts'],
  },
})
