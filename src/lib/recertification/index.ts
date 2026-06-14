// src/lib/recertification/index.ts — public entry point for the recertification API.
//
// Re-exports the recert surface so consumers import from '@/lib/recertification'
// (a real module the bundler can resolve statically) rather than reaching into
// scan.ts directly. The training-complete → recert-close hook depends on this.

export {
  scanRecertifications,
  completeRecertForModule,
  RECERT_OPEN_STATUSES,
} from './scan'
export type { RecertScanResult } from './scan'
