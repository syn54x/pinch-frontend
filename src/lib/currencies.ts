// The primary-currency picker's vocabulary, shared by onboarding's currency
// step and the Settings Preferences pane (F7 CP1). The backend accepts any
// ISO-4217-shaped code; this list is the offered subset, not a validation.
export const CURRENCIES = [
  'USD',
  'EUR',
  'GBP',
  'CAD',
  'AUD',
  'JPY',
  'CHF',
  'CNY',
  'INR',
  'BRL',
  'MXN',
  'SEK',
  'NOK',
  'DKK',
  'NZD',
  'SGD',
  'HKD',
  'ZAR',
]

export function currencyLabel(code: string): string {
  const name = new Intl.DisplayNames(undefined, { type: 'currency' }).of(code)
  return name !== undefined && name !== code ? `${code} — ${name}` : code
}

/** The offered codes with the user's current one prepended when it's
 * off-list — a saved exotic code must stay pickable. */
export function currencyOptions(current: string): string[] {
  return CURRENCIES.includes(current) ? CURRENCIES : [current, ...CURRENCIES]
}
