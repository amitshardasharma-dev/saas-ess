// src/types/onboarding.ts
//
// Onboarding types — defined in a types-only module (no Supabase import) so
// client components can import them without dragging in @/lib/onboarding, which
// value-imports supabaseAdmin and crashes the browser bundle ("supabaseKey is
// required"). @/lib/onboarding re-exports these to preserve its public surface.

// 'completed' = every mandatory step is done or marked not needed. The person
// now waits for an admin. 'approved' = an admin approved the person.
export type OnboardingStatus =
  | 'not_started'
  | 'in_progress'
  | 'blocked'
  | 'completed'
  | 'approved';

export const ONBOARDING_STATUSES: OnboardingStatus[] = [
  'not_started',
  'in_progress',
  'blocked',
  'completed',
  'approved',
];

/** Admin-facing label for a status. */
export function onboardingStatusLabel(status: OnboardingStatus | string): string {
  switch (status) {
    case 'not_started': return 'Not started';
    case 'in_progress': return 'In progress';
    case 'blocked': return 'Blocked';
    case 'completed': return 'Ready for approval';
    case 'approved': return 'Approved';
    default: return String(status).replace(/_/g, ' ');
  }
}

/** Tailwind classes for a status chip. */
export const ONBOARDING_STATUS_CHIP: Record<OnboardingStatus, string> = {
  not_started: 'bg-muted text-muted-foreground',
  in_progress: 'bg-blue-100 text-blue-800',
  blocked: 'bg-amber-100 text-amber-800',
  completed: 'bg-violet-100 text-violet-800',
  approved: 'bg-green-100 text-green-800',
};

/** flow = copied from a template; personal = added by an admin for one person. */
export type OnboardingStepOrigin = 'flow' | 'personal';

export type OnboardingStepStatus = 'pending' | 'done' | 'skipped';

// Typed/linked steps (migration 058). A step can reference a real artifact so
// that completing the real action auto-completes the matching step.
export type OnboardingStepType =
  | 'profile_field'
  | 'doc_sign'
  | 'doc_ack'
  | 'certification'
  | 'training'
  | 'manual';

// What ref_id points at, by step_type:
//   doc_sign / doc_ack   -> ref_id = ess_documents.id
//   certification        -> ref_id = ess_cert_types.id
//   training             -> ref_id = ess_training_modules.id
//   profile_field / manual -> ref_id null
export type OnboardingRefKind = 'document' | 'cert_type' | 'training_module';

export interface OnboardingStep {
  id: string;
  company_id: string;
  template_id: string | null;
  employee_id: string | null;
  title: string;
  description: string | null;
  sort_order: number;
  status: OnboardingStepStatus;
  completed_at: string | null;
  step_type: OnboardingStepType;
  ref_kind: OnboardingRefKind | null;
  ref_id: string | null;
  auto_complete: boolean;
  /** Mandatory steps block approval until done or marked not needed. */
  is_required: boolean;
  origin: OnboardingStepOrigin;
  added_by?: string | null;
  waived_by?: string | null;
  waived_at?: string | null;
  waive_reason?: string | null;
}

export interface VolunteerType {
  id: string;
  name: string;
  description: string | null;
  sort_order: number;
}

export interface OnboardingState {
  id: string;
  company_id: string;
  employee_id: string;
  status: OnboardingStatus;
  blocked_reason: string | null;
  completed_at: string | null;
  approved_at?: string | null;
  approved_by?: string | null;
}

/** One row of the admin progress page (GET /api/onboarding/progress). */
export interface ProgressRow {
  employeeId: string
  name: string
  email: string | null
  role: 'admin' | 'hr' | 'manager' | 'staff' | 'employee'
  isActive: boolean
  typeIds: string[]
  status: OnboardingStatus
  total: number
  resolved: number
  requiredTotal: number
  requiredResolved: number
  openSteps: { id: string; title: string; isRequired: boolean; stepType: string }[]
  approvedAt: string | null
  approvedBy: string | null
}
