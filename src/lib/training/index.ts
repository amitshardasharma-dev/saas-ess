// src/lib/training/index.ts
//
// Phase 5 published contract surface (conventions §5). Phases 6 and 7 import
// from '@/lib/training' — keep these names + signatures stable.
//
//   resolveAssignees(moduleId)
//   recomputeModuleProgress(employeeId, moduleId)
//   recordQuizResult(employeeId, itemId, passed, score)   <-- Phase 6, FROZEN
//
// Plus supporting pure helpers (video parsing, progress math) and tracking
// utilities used by the API routes.

export {
  resolveAssignees,
  isAssigned,
  assignedModuleIdsForEmployee,
  type Assignee,
} from './assignments'

export {
  recomputeModuleProgress,
  recordQuizResult,
  recordItemEvent,
  recordTrainingEvent,
  markItemComplete,
  accrueTime,
  MAX_TICK_SECONDS,
  MAX_ITEM_TIME_SECONDS,
} from './tracking'

export {
  computePercentComplete,
  statusForPercent,
  completedItemIds,
  type RequiredFlaggable,
} from './progress'

export {
  detectVideoProvider,
  videoEmbedUrl,
  youtubeId,
  vimeoId,
} from './video'

export { tryAdvanceOnboarding, tryRecertHook } from './onboarding'
