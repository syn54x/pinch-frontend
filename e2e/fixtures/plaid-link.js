// A fake of Plaid's link-initialize.js served by Playwright route
// interception — the suite's stand-in for the one third party we mock,
// at its own network boundary. Implements the script contract that
// react-plaid-link consumes: window.Plaid.create(config) → handler.
//
// Knobs (set via addInitScript before page load):
//   window.__E2E_PLAID_MODE — 'success' (default) | 'cancel' | 'error'
//   window.__E2E_PLAID_PUBLIC_TOKEN — the sandbox token to succeed with
window.Plaid = {
  create({ onSuccess, onExit }) {
    return {
      open() {
        const mode = window.__E2E_PLAID_MODE ?? 'success'
        setTimeout(() => {
          if (mode === 'success') {
            onSuccess(
              window.__E2E_PLAID_PUBLIC_TOKEN ?? 'e2e-fake-public-token',
              { accounts: [] },
            )
          } else if (mode === 'cancel') {
            onExit(null, {})
          } else {
            onExit(
              {
                error_code: 'E2E_SIMULATED',
                display_message: 'Simulated Plaid failure',
              },
              {},
            )
          }
        }, 50)
      },
      exit() {},
      destroy() {},
    }
  },
}
