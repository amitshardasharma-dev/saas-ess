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
}

export interface OnboardingState {
  id: string;
  company_id: string;
  employee_id: string;
  status: OnboardingStatus;
  blocked_reason: string | null;
  completed_at: string | null;
}
