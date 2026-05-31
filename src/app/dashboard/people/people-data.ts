import { supabaseAdmin } from '@/lib/supabase-server';
import { getEnabledModules } from '@/lib/modules';
import type { UserRole } from '@/types/roles';
import type { OnboardingStatus } from '@/lib/onboarding';

export interface PersonRow {
  id: string;
  name: string;
  email: string | null;
  role: UserRole;
  orgUnit: string | null;
  onboardingStatus: OnboardingStatus;
  // Defensive cross-phase sources. "—" means the source is absent/disabled.
  certifications: number | '—';
  signedDocuments: number | '—';
}

interface EmployeeRecord {
  id: string;
  full_name?: string | null;
  name?: string | null;
  email?: string | null;
  role?: UserRole | null;
  app_user_id?: string | null;
  org_unit?: string | null;
  department?: string | null;
}

/**
 * Loads people-dashboard rows for a company, joining onboarding state and,
 * defensively, Phase-3 certifications (may not exist) and Phase-4 signed
 * documents (exists in the merged base). Missing sources surface as "—".
 */
export async function loadPeople(companyId: string): Promise<PersonRow[]> {
  const supabase = supabaseAdmin;

  const enabledModules = await getEnabledModules(companyId);

  const { data: employees } = await supabase
    .from('ess_employees')
    .select('*')
    .eq('company_id', companyId);

  const rows = (employees ?? []) as EmployeeRecord[];
  if (rows.length === 0) {
    return [];
  }

  const employeeIds = rows.map((e) => e.id);

  // Role lives on ess_app_users (employees link via app_user_id).
  const roleByAppUser = new Map<string, UserRole>();
  const appUserIds = rows
    .map((e) => e.app_user_id)
    .filter((id): id is string => Boolean(id));
  if (appUserIds.length > 0) {
    const { data: appUsers } = await supabase
      .from('ess_app_users')
      .select('id, role')
      .eq('company_id', companyId)
      .in('id', appUserIds);
    for (const u of (appUsers ?? []) as { id: string; role: UserRole }[]) {
      roleByAppUser.set(u.id, u.role);
    }
  }

  // Onboarding states.
  const stateByEmployee = new Map<string, OnboardingStatus>();
  const { data: states } = await supabase
    .from('ess_onboarding_states')
    .select('employee_id, status')
    .eq('company_id', companyId)
    .in('employee_id', employeeIds);
  for (const s of (states ?? []) as { employee_id: string; status: OnboardingStatus }[]) {
    stateByEmployee.set(s.employee_id, s.status);
  }

  // Phase-4 signed documents (module-guarded + try/catch).
  const docsByEmployee = new Map<string, number>();
  let docsAvailable = false;
  try {
    if (enabledModules.includes('documents_esign') || enabledModules.includes('documents')) {
      const { data: docs, error } = await supabase
        .from('ess_signed_documents')
        .select('employee_id')
        .eq('company_id', companyId);
      if (!error) {
        docsAvailable = true;
        for (const d of (docs ?? []) as { employee_id: string | null }[]) {
          if (d.employee_id) {
            docsByEmployee.set(d.employee_id, (docsByEmployee.get(d.employee_id) ?? 0) + 1);
          }
        }
      }
    }
  } catch {
    docsAvailable = false;
  }

  // Phase-3 certifications — table does NOT exist yet in this base.
  const certsByEmployee = new Map<string, number>();
  let certsAvailable = false;
  try {
    if (enabledModules.includes('compliance')) {
      const { data: certs, error } = await supabase
        .from('ess_certifications')
        .select('employee_id')
        .eq('company_id', companyId);
      if (!error) {
        certsAvailable = true;
        for (const c of (certs ?? []) as { employee_id: string | null }[]) {
          if (c.employee_id) {
            certsByEmployee.set(c.employee_id, (certsByEmployee.get(c.employee_id) ?? 0) + 1);
          }
        }
      }
    }
  } catch {
    certsAvailable = false;
  }

  return rows.map((e) => ({
    id: e.id,
    name: e.full_name ?? e.name ?? '(unnamed)',
    email: e.email ?? null,
    role: (e.app_user_id ? roleByAppUser.get(e.app_user_id) : undefined) ?? 'employee',
    orgUnit: e.org_unit ?? e.department ?? null,
    onboardingStatus: stateByEmployee.get(e.id) ?? 'not_started',
    certifications: certsAvailable ? certsByEmployee.get(e.id) ?? 0 : '—',
    signedDocuments: docsAvailable ? docsByEmployee.get(e.id) ?? 0 : '—',
  }));
}
