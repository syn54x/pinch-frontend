import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import basicSsl from '@vitejs/plugin-basic-ssl'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    tanstackRouter({ target: 'react', autoCodeSplitting: true }),
    react(),
    tailwindcss(),
    // Opt-in HTTPS (`pnpm dev:https`): Plaid's production OAuth redirect
    // demands an https URI, while the e2e webServer stays plain http.
    ...(process.env.VITE_HTTPS ? [basicSsl()] : []),
  ],
  resolve: {
    alias: { '@': new URL('./src', import.meta.url).pathname },
  },
  server: {
    // In https mode the API must be same-origin: Safari blocks an https
    // page's fetches to http://localhost outright (no localhost mixed-
    // content exemption), and schemeful same-site withholds the Lax
    // session cookie cross-scheme everywhere else. Proxying makes dev
    // match the hosted same-origin shape; dev:https points
    // VITE_API_BASE_URL back at this origin.
    proxy: process.env.VITE_HTTPS
      ? {
          '/api': 'http://localhost:8000',
          '/health': 'http://localhost:8000',
        }
      : undefined,
  },
})
