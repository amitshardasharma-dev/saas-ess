// src/types/training.ts
//
// Phase 5 (LMS) types + Zod schemas. Mirrors the migration 035–037 schema and
// the published @/lib/training contracts. Colocated Zod validators are used by
// the API routes to validate request bodies (conventions §6.5).

import { z } from 'zod'

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------
export const TRAINING_MODULE_STATUSES = ['draft', 'published', 'archived'] as const
export type TrainingModuleStatus = (typeof TRAINING_MODULE_STATUSES)[number]

export const TRAINING_ITEM_TYPES = ['video', 'document', 'quiz'] as const
export type TrainingItemType = (typeof TRAINING_ITEM_TYPES)[number]

export const TRAINING_PROGRESS_STATUSES = ['not_started', 'in_progress', 'complete'] as const
export type TrainingProgressStatus = (typeof TRAINING_PROGRESS_STATUSES)[number]

export const TRAINING_TARGET_TYPES = ['role', 'org_unit', 'group', 'user'] as const
export type TrainingTargetType = (typeof TRAINING_TARGET_TYPES)[number]

/** Known video providers detected from a URL. */
export const VIDEO_PROVIDERS = ['youtube', 'vimeo', 'other'] as const
export type VideoProvider = (typeof VIDEO_PROVIDERS)[number]

/** Canonical training event names written to ess_training_events. */
export const TRAINING_EVENTS = [
  'module_started',
  'video_watched',
  'doc_downloaded',
  'doc_acknowledged',
  'quiz_passed',
  'quiz_failed',
  'time_tick',
  'module_completed',
] as const
export type TrainingEventName = (typeof TRAINING_EVENTS)[number]

// ---------------------------------------------------------------------------
// Row types
// ---------------------------------------------------------------------------
export interface TrainingModule {
  id: string
  company_id: string
  title: string
  description: string | null
  status: TrainingModuleStatus
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface TrainingItem {
  id: string
  company_id: string
  module_id: string
  type: TrainingItemType
  title: string
  video_url: string | null
  video_provider: VideoProvider | null
  document_id: string | null
  /** Phase 6 ess_quizzes.id — FK-less join point. */
  quiz_id: string | null
  required: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

export interface TrainingGroup {
  id: string
  company_id: string
  name: string
  criteria: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

export interface TrainingGroupMember {
  id: string
  company_id: string
  group_id: string
  employee_id: string
  created_at: string
}

export interface TrainingAssignment {
  id: string
  company_id: string
  module_id: string
  target_type: TrainingTargetType
  target_value: string
  assigned_at: string
  due_at: string | null
}

export interface TrainingProgress {
  id: string
  company_id: string
  employee_id: string
  module_id: string
  percent_complete: number
  status: TrainingProgressStatus
  started_at: string | null
  completed_at: string | null
  created_at: string
  updated_at: string
}

export interface TrainingItemProgress {
  id: string
  company_id: string
  employee_id: string
  item_id: string
  status: TrainingProgressStatus
  acknowledged: boolean
  time_spent_seconds: number
  last_event_at: string | null
  completed_at: string | null
  created_at: string
  updated_at: string
}

export interface TrainingEvent {
  id: string
  company_id: string
  employee_id: string
  item_id: string | null
  module_id: string
  event: string
  meta: Record<string, unknown>
  created_at: string
}

// ---------------------------------------------------------------------------
// Composite view types (returned by APIs to the learning view)
// ---------------------------------------------------------------------------
export interface TrainingItemWithProgress extends TrainingItem {
  progress: TrainingItemProgress | null
}

export interface TrainingModuleWithItems extends TrainingModule {
  items: TrainingItem[]
}

export interface AssignedModule extends TrainingModule {
  items: TrainingItemWithProgress[]
  percent_complete: number
  module_status: TrainingProgressStatus
  due_at: string | null
}

// ---------------------------------------------------------------------------
// Zod schemas (request validation)
// ---------------------------------------------------------------------------
export const createModuleSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional().nullable(),
})

export const updateModuleSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  status: z.enum(TRAINING_MODULE_STATUSES).optional(),
})

export const createItemSchema = z
  .object({
    type: z.enum(TRAINING_ITEM_TYPES),
    title: z.string().min(1, 'Title is required'),
    video_url: z.string().url().optional().nullable(),
    document_id: z.string().uuid().optional().nullable(),
    quiz_id: z.string().uuid().optional().nullable(),
    required: z.boolean().optional(),
    sort_order: z.number().int().optional(),
  })
  .refine((v) => v.type !== 'video' || !!v.video_url, {
    message: 'video items require a video_url',
    path: ['video_url'],
  })
  .refine((v) => v.type !== 'document' || !!v.document_id, {
    message: 'document items require a document_id',
    path: ['document_id'],
  })
  .refine((v) => v.type !== 'quiz' || !!v.quiz_id, {
    message: 'quiz items require a quiz_id',
    path: ['quiz_id'],
  })

export const reorderItemsSchema = z.object({
  /** Ordered list of item ids; index becomes the new sort_order. */
  item_ids: z.array(z.string().uuid()).min(1),
})

export const createAssignmentSchema = z.object({
  target_type: z.enum(TRAINING_TARGET_TYPES),
  target_value: z.string().min(1),
  due_at: z.string().optional().nullable(),
})

export const createGroupSchema = z.object({
  name: z.string().min(1),
  criteria: z.record(z.string(), z.unknown()).optional().nullable(),
  member_ids: z.array(z.string().uuid()).optional(),
})

export const trackEventSchema = z
  .object({
    item_id: z.string().uuid(),
    event: z.enum(['video_watched', 'doc_downloaded', 'doc_acknowledged', 'time_tick']),
    /** Only meaningful for time_tick (seconds of active view since last tick). */
    seconds: z.number().int().positive().optional(),
  })
  .refine((v) => v.event !== 'time_tick' || typeof v.seconds === 'number', {
    message: 'time_tick requires seconds',
    path: ['seconds'],
  })

export type CreateModuleInput = z.infer<typeof createModuleSchema>
export type UpdateModuleInput = z.infer<typeof updateModuleSchema>
export type CreateItemInput = z.infer<typeof createItemSchema>
export type ReorderItemsInput = z.infer<typeof reorderItemsSchema>
export type CreateAssignmentInput = z.infer<typeof createAssignmentSchema>
export type CreateGroupInput = z.infer<typeof createGroupSchema>
export type TrackEventInput = z.infer<typeof trackEventSchema>

/**
 * A resolved training assignee. Defined here (a types-only module) rather than in
 * @/lib/training/assignments so client code can import the type without pulling
 * the server-only assignments module — which value-imports supabaseAdmin and
 * throws "supabaseKey is required" in the browser bundle.
 */
export interface Assignee {
  employee_id: string
  full_name: string | null
  department: string | null
}
