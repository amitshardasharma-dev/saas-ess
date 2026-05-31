// src/config/navigation.ts
//
// Central navigation registry. The sidebar renders from `navRegistry`, filtering
// each section/item by module-enabled state + role and resolving titles via the
// terminology system.
//
// PARALLEL-SAFETY CONTRACT (see _SHARED_CONVENTIONS.md §4.2):
//   Each later phase creates its own nav file
//   (src/config/nav/phase-<N>-<slug>.nav.tsx) and adds:
//     - exactly ONE import line under its own `// === PHASE-N NAV ===` marker
//     - exactly ONE spread under its own `// PHASE-N ENTRIES` comment
//   Because every phase writes under a DIFFERENT marker line, git auto-merges
//   without conflict. Never edit another phase's marker block, the core import,
//   or the core spread.

import type { NavSection } from './nav/types'
import { coreNav } from './nav/core.nav'
// === PHASE-2 NAV (insert import above this line) ===
// === PHASE-3 NAV ===
// === PHASE-4 NAV ===
import { phase4EsignNav } from './nav/phase-4-esign.nav'
// === PHASE-5 NAV ===
// === PHASE-6 NAV ===
// === PHASE-7 NAV ===

export const navRegistry: NavSection[] = [
	...coreNav,
	// PHASE-2 ENTRIES
	// PHASE-3 ENTRIES
	// PHASE-4 ENTRIES
	...phase4EsignNav,
	// PHASE-5 ENTRIES
	// PHASE-6 ENTRIES
	// PHASE-7 ENTRIES
].sort((a, b) => a.order - b.order)
