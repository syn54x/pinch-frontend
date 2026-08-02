import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// RTL's automatic cleanup registers off the GLOBAL afterEach, which this
// rig doesn't expose (globals: false) — so renders would leak between
// tests in a file without this explicit hook.
afterEach(() => cleanup())
