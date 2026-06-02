// src/lib/labels/resolve.ts
//
// Pure (server + client safe) terminology resolution. No I/O here so it can be
// unit-tested and shared between getLabels() (server) and useLabels() (client).

import { DEFAULT_LABELS, isTermKey, LabelEntry, TermKey } from './defaults'

/** A fully-resolved label map: every term key has singular + plural. */
export type ResolvedLabels = Record<TermKey, LabelEntry>

/** Options for the `t` accessor. */
export interface LabelOptions {
  plural?: boolean
}

/** A raw override row as stored in ess_tenant_labels. */
export interface LabelOverrideRow {
  term_key: string
  singular: string
  plural: string
}

/**
 * Merge tenant overrides onto platform defaults. Unknown term keys are ignored
 * so a stale DB row can never break the resolver.
 */
export function resolveLabels(overrides: LabelOverrideRow[]): ResolvedLabels {
  const resolved: ResolvedLabels = { ...DEFAULT_LABELS }
  for (const row of overrides) {
    if (!isTermKey(row.term_key)) continue
    resolved[row.term_key] = { singular: row.singular, plural: row.plural }
  }
  return resolved
}

/**
 * Build a `t(key, { plural })` accessor over a resolved label map.
 * Falls back to the platform default for a key if it is somehow missing.
 */
export function makeLabelFn(labels: ResolvedLabels) {
  return function t(key: TermKey, options?: LabelOptions): string {
    // Defensive: an unknown/invalid key (e.g. a UI string mistakenly passed in)
    // must never crash the page — fall back to the key itself.
    const entry = labels[key] ?? DEFAULT_LABELS[key]
    if (!entry) return String(key)
    return options?.plural ? entry.plural : entry.singular
  }
}
