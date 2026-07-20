import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createRouter, RouterProvider } from '@tanstack/react-router'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './api/client'
import './index.css'
import { routeTree } from './routeTree.gen'

const queryClient = new QueryClient({
  // No automatic retries: the guard's /me probe must answer fast (a 401 is
  // an answer, not a flake), and e2e failures should fail loudly.
  defaultOptions: { queries: { retry: false } },
})

const router = createRouter({
  routeTree,
  context: { queryClient },
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

// biome-ignore lint/style/noNonNullAssertion: #root is in index.html
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
)
