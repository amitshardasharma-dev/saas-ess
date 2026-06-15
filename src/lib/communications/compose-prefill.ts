// src/lib/communications/compose-prefill.ts
//
// Phase 7 — handoff key for pre-filling the composer (resend / continue draft).
//
// The console writes a small JSON payload ({ subject, body? }) to sessionStorage under
// this key, then navigates to /dashboard/communications/compose, which reads + clears
// it on mount. Lives in lib so the page and the console share one constant without a
// page module exporting a non-handler symbol. No server contract is involved.

export const COMPOSE_PREFILL_KEY = 'ess.compose.prefill'

export interface ComposePrefill {
  subject: string
  /** Optional markdown body. Omitted for sent messages (which persist rendered HTML). */
  body?: string
}
