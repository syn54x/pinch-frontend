import { defineConfig } from 'vitest/config'

// Component-test rig. First real component coverage arrived with F6 CP1
// (the Penny surface) — the alias mirrors vite.config.ts so components
// importing `@/...` resolve here too.
export default defineConfig({
  resolve: {
    alias: { '@': new URL('./src', import.meta.url).pathname },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    setupFiles: ['./vitest.setup.ts'],
    passWithNoTests: true,
  },
})
