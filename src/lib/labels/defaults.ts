// src/lib/labels/defaults.ts
//
// Platform-default terminology. A tenant overrides singular/plural per term via
// the ess_tenant_labels table; the resolver falls back to these defaults when a
// term is not overridden, so every tenant works out of the box.

/**
 * Term keys for every user-facing entity noun routed through the resolver.
 * Add new keys here (and to DEFAULT_LABELS) — never hard-code entity names in UI,
 * emails, or exports.
 */
export const TERM_KEYS = [
  'person',
  'supervisor',
  'org_unit',
  'certification',
  'training_module',
  'document',
] as const

export type TermKey = (typeof TERM_KEYS)[number]

export interface LabelEntry {
  singular: string
  plural: string
}

/** Generic neutral defaults. Birch overrides these via seed-phase-1. */
export const DEFAULT_LABELS: Record<TermKey, LabelEntry> = {
  person: { singular: 'Person', plural: 'People' },
  supervisor: { singular: 'Supervisor', plural: 'Supervisors' },
  org_unit: { singular: 'Team', plural: 'Teams' },
  certification: { singular: 'Certification', plural: 'Certifications' },
  training_module: { singular: 'Training Module', plural: 'Training Modules' },
  document: { singular: 'Document', plural: 'Documents' },
}

export function isTermKey(key: string): key is TermKey {
  return (TERM_KEYS as readonly string[]).includes(key)
}
