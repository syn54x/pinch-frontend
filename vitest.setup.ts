import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// RTL's automatic cleanup registers off the GLOBAL afterEach, which this
// rig doesn't expose (globals: false) — so renders would leak between
// tests in a file without this explicit hook.
afterEach(() => cleanup())

// Node ≥22 ships its own unimplemented-without-a-flag global `localStorage`
// (warns "not available because --localstorage-file was not provided").
// Vitest's jsdom environment only copies a `window` property onto the test
// global when the global doesn't already own one — since Node's stub
// already does, jsdom's real Storage never gets copied over, and every
// localStorage-backed module (lib/sidebar.ts, lib/theme.ts) sees `undefined`
// instead. The jsdom environment does expose its JSDOM instance as
// `globalThis.jsdom`, so pull the real implementation from there.
declare global {
  var jsdom: { window: Window } | undefined
}
if (typeof globalThis.jsdom !== 'undefined') {
  Object.defineProperty(globalThis, 'localStorage', {
    get: () => globalThis.jsdom?.window.localStorage,
    configurable: true,
  })
  Object.defineProperty(globalThis, 'sessionStorage', {
    get: () => globalThis.jsdom?.window.sessionStorage,
    configurable: true,
  })
}
