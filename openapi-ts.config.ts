import { defineConfig } from '@hey-api/openapi-ts'

// Generates the typed API client from the committed openapi.json snapshot.
// Regenerate via `just openapi-sync` — never hand-edit src/api/generated.
export default defineConfig({
  input: 'openapi.json',
  output: 'src/api/generated',
  plugins: ['@hey-api/client-fetch', '@tanstack/react-query'],
})
