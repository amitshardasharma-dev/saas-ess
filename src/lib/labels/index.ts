// src/lib/labels/index.ts
//
// Public surface of the terminology resolver (Phase 1 published contract).
// Server callers: import { getLabels } from '@/lib/labels'
// Client callers: import { useLabels } from '@/hooks/use-labels'

export * from './defaults'
export * from './resolve'
export { getLabels, getLabelFn } from './server'
