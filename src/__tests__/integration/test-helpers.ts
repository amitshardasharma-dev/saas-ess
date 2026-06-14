/**
 * Integration test helpers — shared utilities for API-level testing.
 *
 * These tests call the actual Next.js API route handlers directly,
 * with mocked Supabase to avoid needing a real database.
 */
import { NextRequest } from 'next/server'

// Re-export the mock supabase
export { createMockSupabase, mockSupabaseData } from '../mocks/supabase'

/**
 * Create a mock NextRequest with optional auth token and body
 */
export function createRequest(
  url: string,
  options: {
    method?: string
    token?: string
    body?: Record<string, unknown>
    searchParams?: Record<string, string>
  } = {}
) {
  const { method = 'GET', token, body, searchParams } = options

  const fullUrl = new URL(url, 'http://localhost:3001')
  if (searchParams) {
    for (const [key, value] of Object.entries(searchParams)) {
      fullUrl.searchParams.set(key, value)
    }
  }

  const headers = new Headers()
  if (token) headers.set('Authorization', `Bearer ${token}`)
  if (body) headers.set('Content-Type', 'application/json')

  const init: { method: string; headers: Headers; body?: string } = { method, headers }
  if (body) init.body = JSON.stringify(body)

  // Use NextRequest constructor
  return new NextRequest(fullUrl, init)
}

/**
 * Parse JSON response from NextResponse
 */
export async function parseResponse(response: Response) {
  const json = await response.json()
  return { status: response.status, data: json }
}

/**
 * Standard mock data for Acme Corp tenant
 */
export const ACME_COMPANY_ID = 'company-acme'
export const BETA_COMPANY_ID = 'company-beta'

export const testUsers = {
  acmeAdmin: { authId: 'auth-acme-admin', appUserId: 'app-acme-admin', employeeId: 'emp-acme-admin', email: 'admin@acme.com', role: 'admin', isSuperAdmin: true },
  acmeHr: { authId: 'auth-acme-hr', appUserId: 'app-acme-hr', employeeId: 'emp-acme-hr', email: 'hr@acme.com', role: 'hr', isSuperAdmin: false },
  acmeManager: { authId: 'auth-acme-mgr', appUserId: 'app-acme-mgr', employeeId: 'emp-acme-mgr', email: 'manager@acme.com', role: 'manager', isSuperAdmin: false },
  acmeEmployee: { authId: 'auth-acme-emp1', appUserId: 'app-acme-emp1', employeeId: 'emp-acme-emp1', email: 'employee1@acme.com', role: 'employee', isSuperAdmin: false },
  betaAdmin: { authId: 'auth-beta-admin', appUserId: 'app-beta-admin', employeeId: 'emp-beta-admin', email: 'admin@beta.com', role: 'admin', isSuperAdmin: false },
}

/**
 * Build mock Supabase data for multi-tenant testing
 */
export function buildMockData() {
  return {
    ess_companies: [
      { id: ACME_COMPANY_ID, name: 'Acme Corp', slug: 'acme-corp', plan: 'professional', status: 'active', max_users: 100, max_storage_mb: 2000, bc_enabled: false, settings: { modules_enabled: ['leave', 'expense', 'timesheets', 'documents', 'appraisals', 'contracts', 'team_calendar'] }, created_at: '2026-01-01T00:00:00Z' },
      { id: BETA_COMPANY_ID, name: 'Beta Inc', slug: 'beta-inc', plan: 'starter', status: 'active', max_users: 25, max_storage_mb: 500, bc_enabled: false, settings: { modules_enabled: ['leave', 'expense', 'timesheets', 'documents'] }, created_at: '2026-02-01T00:00:00Z' },
    ],
    ess_app_users: [
      { id: 'app-acme-admin', auth_user_id: 'auth-acme-admin', company_id: ACME_COMPANY_ID, role: 'admin', is_active: true, is_super_admin: true },
      { id: 'app-acme-hr', auth_user_id: 'auth-acme-hr', company_id: ACME_COMPANY_ID, role: 'hr', is_active: true, is_super_admin: false },
      { id: 'app-acme-mgr', auth_user_id: 'auth-acme-mgr', company_id: ACME_COMPANY_ID, role: 'manager', is_active: true, is_super_admin: false },
      { id: 'app-acme-emp1', auth_user_id: 'auth-acme-emp1', company_id: ACME_COMPANY_ID, role: 'employee', is_active: true, is_super_admin: false },
      { id: 'app-beta-admin', auth_user_id: 'auth-beta-admin', company_id: BETA_COMPANY_ID, role: 'admin', is_active: true, is_super_admin: false },
    ],
    ess_employees: [
      { id: 'emp-acme-admin', app_user_id: 'app-acme-admin', company_id: ACME_COMPANY_ID, full_name: 'Alice Admin', employee_no: 'ACME001', department: 'Management', email: 'admin@acme.com', reports_to: null, is_approver: true, leave_approval_enabled: 1, expense_approval_enabled: 1, status: 'Active' },
      { id: 'emp-acme-hr', app_user_id: 'app-acme-hr', company_id: ACME_COMPANY_ID, full_name: 'Hannah HR', employee_no: 'ACME002', department: 'HR', email: 'hr@acme.com', reports_to: null, is_approver: false, leave_approval_enabled: 0, expense_approval_enabled: 0, status: 'Active' },
      { id: 'emp-acme-mgr', app_user_id: 'app-acme-mgr', company_id: ACME_COMPANY_ID, full_name: 'Mike Manager', employee_no: 'ACME003', department: 'Engineering', email: 'manager@acme.com', reports_to: null, is_approver: true, leave_approval_enabled: 1, expense_approval_enabled: 1, status: 'Active' },
      { id: 'emp-acme-emp1', app_user_id: 'app-acme-emp1', company_id: ACME_COMPANY_ID, full_name: 'Eve Employee', employee_no: 'ACME004', department: 'Engineering', email: 'employee1@acme.com', reports_to: 'emp-acme-mgr', is_approver: false, leave_approval_enabled: 0, expense_approval_enabled: 0, status: 'Active' },
      { id: 'emp-beta-admin', app_user_id: 'app-beta-admin', company_id: BETA_COMPANY_ID, full_name: 'Beta Admin', employee_no: 'BETA001', department: 'Management', email: 'admin@beta.com', reports_to: null, is_approver: true, leave_approval_enabled: 1, expense_approval_enabled: 1, status: 'Active' },
    ],
    ess_leave_types: [
      { id: 'lt-acme-al', company_id: ACME_COMPANY_ID, name: 'Annual Leave', code: 'AL', eligible_days: 20 },
      { id: 'lt-acme-sl', company_id: ACME_COMPANY_ID, name: 'Sick Leave', code: 'SL', eligible_days: 10 },
      { id: 'lt-beta-al', company_id: BETA_COMPANY_ID, name: 'Annual Leave', code: 'AL', eligible_days: 15 },
    ],
    ess_approval_rules: [
      { id: 'rule-1', company_id: ACME_COMPANY_ID, rule_type: 'leave', level_no: 1, approver_type: 'reporting_manager', is_active: true },
      { id: 'rule-2', company_id: ACME_COMPANY_ID, rule_type: 'timesheet', level_no: 1, approver_type: 'reporting_manager', is_active: true },
      { id: 'rule-3', company_id: ACME_COMPANY_ID, rule_type: 'expense', level_no: 1, approver_type: 'reporting_manager', is_active: true },
    ],
    ess_timesheet_configs: [
      { id: 'ts-config-1', company_id: ACME_COMPANY_ID, mode: 'simple_hours', submission_cycle: 'weekly', week_start_day: 1, required_hours_per_day: 8, overtime_enabled: false, projects_enabled: false },
    ],
    ess_timesheets: [],
    ess_timesheet_entries: [],
    ess_timesheet_approval_entries: [],
    ess_documents: [],
    ess_document_categories: [
      { id: 'cat-1', company_id: ACME_COMPANY_ID, name: 'Company Policies', sort_order: 0 },
    ],
    ess_document_versions: [],
    ess_document_acknowledgments: [],
    ess_document_read_tracking: [],
    ess_contracts: [],
    ess_contract_types: [
      { id: 'ct-perm', company_id: ACME_COMPANY_ID, name: 'Permanent', requires_end_date: false, default_duration_months: null },
      { id: 'ct-fixed', company_id: ACME_COMPANY_ID, name: 'Fixed-Term', requires_end_date: true, default_duration_months: 12 },
    ],
    ess_contract_history: [],
    ess_appraisal_templates: [
      { id: 'tmpl-1', company_id: ACME_COMPANY_ID, name: 'Standard Review', description: 'Annual review', is_default: true, sections: [
        { id: 'perf', name: 'Performance', type: 'rating_scale', weight: 40, rating_labels: ['Poor', 'Below', 'Average', 'Good', 'Excellent'] },
        { id: 'strengths', name: 'Strengths', type: 'text', weight: 30 },
        { id: 'goals', name: 'Goals', type: 'goals', weight: 30 },
      ]},
    ],
    ess_appraisal_cycles: [],
    ess_appraisals: [],
    ess_appraisal_responses: [],
    ess_goals: [],
    ess_leave_applications: [],
    ess_leave_approval_entries: [],
    ess_expense_claims: [],
    ess_expense_approval_entries: [],
    ess_expense_categories: [],
    ess_projects: [],
    ess_platform_plans: [
      { id: 'plan-free', name: 'Free', slug: 'free', max_users: 5, max_storage_mb: 100, modules_allowed: ['leave', 'expense'], price_monthly: 0, price_yearly: 0, is_active: true, sort_order: 0 },
      { id: 'plan-starter', name: 'Starter', slug: 'starter', max_users: 25, max_storage_mb: 500, modules_allowed: ['leave', 'expense', 'timesheets', 'documents'], price_monthly: 29, price_yearly: 290, is_active: true, sort_order: 1 },
    ],
    ess_tenant_usage: [],
    ess_announcements: [],
    ess_announcement_dismissals: [],
  }
}
