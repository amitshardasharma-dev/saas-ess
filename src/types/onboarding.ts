// src/types/onboarding.ts
//
// Onboarding types — defined in a types-only module (no Supabase import) so
// client components can import them without dragging in @/lib/onboarding, which
// value-imports supabaseAdmin and crashes the browser bundle ("supabaseKey is
// required"). @/lib/onboarding re-exports these to preserve its public surface.

export type OnboardingStatus =
  | 'not_started'
  | 'in_progress'
  | 'blocked'
  | 'completed';

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
}

export interface OnboardingState {
  id: string;
  company_id: string;
  employee_id: string;
  status: OnboardingStatus;
  blocked_reason: string | null;
  completed_at: string | null;
}
