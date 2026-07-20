import { defineConfig } from 'vitest/config'

// Component-test rig — wired and ready, intentionally quiet in F1: coverage
// lives at the e2e seam until real interaction logic arrives (F2+).
export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    setupFiles: ['./vitest.setup.ts'],
    passWithNoTests: true,
  },
})
