// Globals the fake-Plaid fixture reads (e2e-only; production never sees these).
declare global {
  interface Window {
    __E2E_PLAID_MODE?: 'success' | 'cancel' | 'error'
    __E2E_PLAID_PUBLIC_TOKEN?: string
  }
}

export {}
