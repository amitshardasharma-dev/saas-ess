// src/lib/reports/training.ts
//
// Phase 7 — training reporting data assembly. Reads Phase 5 training tracking and,
// defensively, Phase 6 quiz attempts. All reads are tenant-scoped. Cross-phase
// tables are read in try/catch so a worktree missing the LMS/quiz migrations still
// produces a (smaller) report instead of crashing.

import { supabaseAdmin } from '@/lib/supabase-admin'

export interface TrainingReportRow {
  employee_id: string
  employee_name: string
  department: string | null
  module_id: string | null
  module_title: string | null
  status: string
  progress_pct: number | null
  completed_at: string | null
  quiz_score: number | null
}

export interface TrainingReportFilters {
  employeeId?: string
  department?: string
  moduleId?: string
  status?: string
}

interface EmployeeLite {
  id: string
  full_name: string | null
  department: string | null
}

async function safeSelect(table: string, build: (q: ReturnType<typeof supabaseAdmin.from>) => unknown): Promise<Record<string, unknown>[]> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res: any = await build(supabaseAdmin.from(table))
    if (res?.error) return []
    return (res?.data ?? []) as Record<string, unknown>[]
  } catch {
    return []
  }
}

/**
 * Build the training report rows for a tenant, applying filters in-memory after a
 * tenant-scoped fetch. Returns a flat, export-ready row set.
 */
export async function buildTrainingReport(
  companyId: string,
  filters: TrainingReportFilters = {},
): Promise<TrainingReportRow[]> {
  // Employees (always present — Phase 0 baseline).
  const employees = (await safeSelect('ess_employees', (q) =>
    q.select('id, full_name, department, company_id').eq('company_id', companyId),
  )) as unknown as EmployeeLite[]
  const empById = new Map(employees.map((e) => [e.id, e]))

  // Phase 5 per-(employee, module) progress rows (migration 037: ess_training_progress).
  // Columns: employee_id, module_id, percent_complete, status, started_at, completed_at.
  const tracking = await safeSelect('ess_training_progress', (q) =>
    q.select('*').eq('company_id', companyId),
  )

  // Module titles (Phase 5).
  const modules = await safeSelect('ess_training_modules', (q) =>
    q.select('id, title, company_id').eq('company_id', companyId),
  )
  const moduleTitle = new Map(modules.map((m) => [String(m.id), (m.title as string | null) ?? null]))

  // Phase 5 training items (migration 035) — used to resolve a quiz attempt's
  // module via its training_item_id. Maps item id -> module id.
  const items = await safeSelect('ess_training_items', (q) =>
    q.select('id, module_id, company_id').eq('company_id', companyId),
  )
  const itemModule = new Map(items.map((i) => [String(i.id), i.module_id != null ? String(i.module_id) : null]))

  // Phase 6 quiz attempts (migration 046) — defensive (table may not exist in this
  // worktree). ess_quiz_attempts has training_item_id (not module_id), so we resolve
  // the module through ess_training_items, then key best-score per (employee, module).
  const attempts = await safeSelect('ess_quiz_attempts', (q) =>
    q.select('*').eq('company_id', companyId),
  )
  const bestScore = new Map<string, number>()
  for (const a of attempts) {
    const emp = a.employee_id
    const itemId = a.training_item_id
    const score = a.score
    if (emp == null || itemId == null || score == null) continue
    const mod = itemModule.get(String(itemId))
    if (mod == null) continue
    const key = `${String(emp)}:${mod}`
    const num = Number(score)
    if (!Number.isNaN(num)) bestScore.set(key, Math.max(bestScore.get(key) ?? 0, num))
  }

  const rows: TrainingReportRow[] = tracking.map((t) => {
    const employeeId = String(t.employee_id ?? '')
    const emp = empById.get(employeeId)
    const moduleId = t.module_id != null ? String(t.module_id) : null
    const status = String(t.status ?? 'not_started')
    const progress = t.percent_complete ?? null
    const key = moduleId ? `${employeeId}:${moduleId}` : ''
    return {
      employee_id: employeeId,
      employee_name: emp?.full_name ?? 'Unknown',
      department: emp?.department ?? null,
      module_id: moduleId,
      module_title: moduleId ? moduleTitle.get(moduleId) ?? null : null,
      status,
      progress_pct: progress != null ? Number(progress) : null,
      completed_at: (t.completed_at as string | null) ?? null,
      quiz_score: key ? bestScore.get(key) ?? null : null,
    }
  })

  // Apply filters.
  return rows.filter((r) => {
    if (filters.employeeId && r.employee_id !== filters.employeeId) return false
    if (filters.department && r.department !== filters.department) return false
    if (filters.moduleId && r.module_id !== filters.moduleId) return false
    if (filters.status && r.status !== filters.status) return false
    return true
  })
}

export interface ComplianceReportRow {
  employee_id: string
  employee_name: string
  department: string | null
  cert_type: string | null
  expiry_date: string | null
  status: string
  recert_status: string | null
  recert_completed_at: string | null
}

/** Board-ready compliance report: cert status joined with recert history/state. */
export async function buildComplianceReport(companyId: string): Promise<ComplianceReportRow[]> {
  const employees = (await safeSelect('ess_employees', (q) =>
    q.select('id, full_name, department, company_id').eq('company_id', companyId),
  )) as unknown as EmployeeLite[]
  const empById = new Map(employees.map((e) => [e.id, e]))

  const certTypes = await safeSelect('ess_cert_types', (q) =>
    q.select('id, name, company_id').eq('company_id', companyId),
  )
  const certTypeName = new Map(certTypes.map((c) => [String(c.id), (c.name as string | null) ?? null]))

  const certs = await safeSelect('ess_certifications', (q) =>
    q.select('*').eq('company_id', companyId),
  )

  const recerts = await safeSelect('ess_recertifications', (q) =>
    q.select('*').eq('company_id', companyId),
  )
  const recertByCert = new Map(recerts.map((r) => [String(r.certification_id), r]))

  return certs.map((c) => {
    const employeeId = String(c.employee_id ?? '')
    const emp = empById.get(employeeId)
    const recert = recertByCert.get(String(c.id))
    return {
      employee_id: employeeId,
      employee_name: emp?.full_name ?? 'Unknown',
      department: emp?.department ?? null,
      cert_type: c.cert_type_id != null ? certTypeName.get(String(c.cert_type_id)) ?? null : null,
      expiry_date: (c.expiry_date as string | null) ?? null,
      status: String(c.status ?? ''),
      recert_status: recert ? String(recert.status) : null,
      recert_completed_at: recert ? ((recert.completed_at as string | null) ?? null) : null,
    }
  })
}
