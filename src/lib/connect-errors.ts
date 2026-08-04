/** A provider's connect widget reported a failure — as opposed to the
 * user just closing it (the null outcome) or succeeding. The shared base
 * of the three-outcome connect contract (F8): call sites catch this one
 * type and stay provider-blind; each boundary module (plaid.ts, mx.ts)
 * throws its own subclass. */
export class ConnectExitError extends Error {}
