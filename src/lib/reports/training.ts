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
  /** Stable per-tenant volunteer id (ess_employees.employee_no), if set. */
  employee_no: string | null
  department: string | null
  module_id: string | null
  module_title: string | null
  status: string
  progress_pct: number | null
  /** Module completion timestamp (null until complete). */
  completed_at: string | null
  /**
   * Most recent activity on this (employee, module): completion if complete,
   * else the started_at, else the row's updated_at. Used for the "last activity"
   * column and follow-up triage. ISO string or null.
   */
  last_activity: string | null
  /** Best quiz score (0-100) across the module's quiz items, or null. */
  quiz_score: number | null
  /** Whether the best-scoring attempt passed, or null when no scored attempt. */
  quiz_passed: boolean | null
}

export interface TrainingReportFilters {
  employeeId?: string
  department?: string
  moduleId?: string
  status?: string
}

/** Aggregate roll-up over a set of report rows (drives the dashboard stat cards). */
export interface TrainingReportSummary {
  /** Total (employee, module) assignments represented. */
  total: number
  completed: number
  in_progress: number
  not_started: number
  /** Distinct volunteers and modules present in the rows. */
  volunteers: number
  modules: number
  /** Mean percent_complete across all rows, rounded to 1dp (0 when empty). */
  avg_completion: number
  /** Per-module completion breakdown, sorted by module title. */
  by_module: TrainingModuleSummary[]
}

export interface TrainingModuleSummary {
  module_id: string | null
  module_title: string
  total: number
  completed: number
  in_progress: number
  not_started: number
  avg_completion: number
}

interface EmployeeLite {
  id: string
  full_name: string | null
  employee_no: string | null
  department: string | null
}

/** Canonical training progress statuses, for stable bucketing. */
const STATUSES = ['complete', 'in_progress', 'not_started'] as const

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
    q.select('id, full_name, employee_no, department, company_id').eq('company_id', companyId),
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
  // We retain the `passed` flag of the BEST-scoring attempt so the report can show a
  // pass/fail chip alongside the score.
  const attempts = await safeSelect('ess_quiz_attempts', (q) =>
    q.select('*').eq('company_id', companyId),
  )
  const bestByKey = new Map<string, { score: number; passed: boolean | null }>()
  for (const a of attempts) {
    const emp = a.employee_id
    const itemId = a.training_item_id
    const score = a.score
    if (emp == null || itemId == null || score == null) continue
    const mod = itemModule.get(String(itemId))
    if (mod == null) continue
    const num = Number(score)
    if (Number.isNaN(num)) continue
    const key = `${String(emp)}:${mod}`
    const prev = bestByKey.get(key)
    if (!prev || num > prev.score) {
      bestByKey.set(key, { score: num, passed: a.passed == null ? null : Boolean(a.passed) })
    }
  }

  const rows: TrainingReportRow[] = tracking.map((t) => {
    const employeeId = String(t.employee_id ?? '')
    const emp = empById.get(employeeId)
    const moduleId = t.module_id != null ? String(t.module_id) : null
    const status = String(t.status ?? 'not_started')
    const progress = t.percent_complete ?? null
    const completedAt = (t.completed_at as string | null) ?? null
    const startedAt = (t.started_at as string | null) ?? null
    const updatedAt = (t.updated_at as string | null) ?? null
    const key = moduleId ? `${employeeId}:${moduleId}` : ''
    const best = key ? bestByKey.get(key) : undefined
    return {
      employee_id: employeeId,
      employee_name: emp?.full_name ?? 'Unknown',
      employee_no: emp?.employee_no ?? null,
      department: emp?.department ?? null,
      module_id: moduleId,
      module_title: moduleId ? moduleTitle.get(moduleId) ?? null : null,
      status,
      progress_pct: progress != null ? Number(progress) : null,
      completed_at: completedAt,
      last_activity: completedAt ?? startedAt ?? updatedAt,
      quiz_score: best ? best.score : null,
      quiz_passed: best ? best.passed : null,
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

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

function mean(values: number[]): number {
  if (values.length === 0) return 0
  return round1(values.reduce((a, b) => a + b, 0) / values.length)
}

/**
 * Pure roll-up of report rows into the dashboard summary (stat cards + per-module
 * breakdown). Computed in-memory from the already-filtered rows so the figures
 * always match exactly what the table shows. Unknown statuses fall back to
 * not_started so totals never drift from the row count.
 */
export function summarizeTrainingReport(rows: TrainingReportRow[]): TrainingReportSummary {
  const counts: Record<(typeof STATUSES)[number], number> = {
    complete: 0,
    in_progress: 0,
    not_started: 0,
  }
  const volunteers = new Set<string>()
  const pctValues: number[] = []

  // module_id -> aggregation bucket.
  const moduleBuckets = new Map<
    string,
    { module_id: string | null; module_title: string; counts: typeof counts; pct: number[] }
  >()

  for (const r of rows) {
    const status = (STATUSES as readonly string[]).includes(r.status)
      ? (r.status as (typeof STATUSES)[number])
      : 'not_started'
    counts[status] += 1
    if (r.employee_id) volunteers.add(r.employee_id)
    const pct = r.progress_pct ?? 0
    pctValues.push(pct)

    const mKey = r.module_id ?? '∅'
    let bucket = moduleBuckets.get(mKey)
    if (!bucket) {
      bucket = {
        module_id: r.module_id,
        module_title: r.module_title ?? 'Untitled module',
        counts: { complete: 0, in_progress: 0, not_started: 0 },
        pct: [],
      }
      moduleBuckets.set(mKey, bucket)
    }
    bucket.counts[status] += 1
    bucket.pct.push(pct)
  }

  const by_module: TrainingModuleSummary[] = Array.from(moduleBuckets.values())
    .map((b) => ({
      module_id: b.module_id,
      module_title: b.module_title,
      total: b.counts.complete + b.counts.in_progress + b.counts.not_started,
      completed: b.counts.complete,
      in_progress: b.counts.in_progress,
      not_started: b.counts.not_started,
      avg_completion: mean(b.pct),
    }))
    .sort((a, b) => a.module_title.localeCompare(b.module_title))

  return {
    total: rows.length,
    completed: counts.complete,
    in_progress: counts.in_progress,
    not_started: counts.not_started,
    volunteers: volunteers.size,
    modules: moduleBuckets.size,
    avg_completion: mean(pctValues),
    by_module,
  }
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
