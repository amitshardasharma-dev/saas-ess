// src/app/api/recertification/route.ts
//
// Phase 7 — list recertifications for the tenant (Staff/Admin) and enqueue a scan.
//
// GET  (hr+): returns the tenant's recertification cycles, ENRICHED with the
//   volunteer (full_name + employee_no), the certification's type name + expiry,
//   the assigned refresher module's title, and the per-cycle history timeline
//   (ess_recert_history events). Cross-phase tables (ess_cert_types,
//   ess_certifications, ess_training_modules, ess_recert_history) are read
//   DEFENSIVELY via safeSelect so a worktree missing a migration degrades to a
//   smaller payload instead of 500-ing — same contract the reports/scan layers use.
//
// POST (hr+): enqueues a recert.scan job (runs on the next cron tick). Unchanged.
//
// NOTE: this file is a Route Module — it must export ONLY route handlers
// (GET/POST). All helpers below are module-local and intentionally NOT exported.

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { withAuth } from '@/lib/auth-middleware'
import { enqueueJob } from '@/lib/jobs/dispatch'
import { recordAudit } from '@/lib/audit'

/** A single history event for a recert cycle (ess_recert_history). */
interface RecertHistoryEvent {
  id: string
  event: string
  detail: string | null
  created_at: string | null
}

/** Enriched recertification cycle returned to the dashboard. */
interface EnrichedRecert {
  id: string
  employee_id: string
  certification_id: string
  status: string
  triggered_at: string
  assigned_module_id: string | null
  completed_at: string | null
  // Joined, best-effort (null when the source table is absent / row missing):
  employee_name: string | null
  employee_no: string | null
  department: string | null
  cert_type: string | null
  cert_expiry_date: string | null
  module_title: string | null
  history: RecertHistoryEvent[]
}

/**
 * Tenant-scoped select that never throws: a missing cross-phase table (worktree
 * without that migration) yields [] instead of a 500. Mirrors the reporting layer.
 */
async function safeSelect(
  table: string,
  build: (q: ReturnType<typeof supabaseAdmin.from>) => unknown,
): Promise<Record<string, unknown>[]> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res: any = await build(supabaseAdmin.from(table))
    if (res?.error) return []
    return (res?.data ?? []) as Record<string, unknown>[]
  } catch {
    return []
  }
}

export const GET = withAuth(
  async (_req: NextRequest, { companyId }) => {
    // Base set — recerts MUST load (this table is owned by Phase 7); a hard error
    // here is a real failure, so surface it as 500 like the original handler.
    const { data: recertData, error } = await supabaseAdmin
      .from('ess_recertifications')
      .select('*')
      .eq('company_id', companyId)
      .order('triggered_at', { ascending: false })
    if (error) {
      return NextResponse.json({ error: 'Failed to load recertifications' }, { status: 500 })
    }
    const recerts = (recertData ?? []) as Record<string, unknown>[]

    // Lookups (all best-effort). Empty tenant -> skip the joins entirely.
    const [employees, certTypes, certs, modules] = await Promise.all([
      safeSelect('ess_employees', (q) =>
        q.select('id, full_name, employee_no, department, company_id').eq('company_id', companyId),
      ),
      safeSelect('ess_cert_types', (q) => q.select('id, name, company_id').eq('company_id', companyId)),
      safeSelect('ess_certifications', (q) =>
        q.select('id, cert_type_id, expiry_date, company_id').eq('company_id', companyId),
      ),
      safeSelect('ess_training_modules', (q) =>
        q.select('id, title, company_id').eq('company_id', companyId),
      ),
    ])

    const empById = new Map(employees.map((e) => [String(e.id), e]))
    const certTypeName = new Map(certTypes.map((c) => [String(c.id), (c.name as string | null) ?? null]))
    const certById = new Map(certs.map((c) => [String(c.id), c]))
    const moduleTitle = new Map(modules.map((m) => [String(m.id), (m.title as string | null) ?? null]))

    // History for just this tenant's cycles (single query, grouped in memory).
    const recertIds = recerts.map((r) => String(r.id))
    const historyByRecert = new Map<string, RecertHistoryEvent[]>()
    if (recertIds.length > 0) {
      const historyRows = await safeSelect('ess_recert_history', (q) =>
        q
          .select('id, recertification_id, event, detail, created_at')
          .in('recertification_id', recertIds)
          .order('created_at', { ascending: true }),
      )
      for (const h of historyRows) {
        const key = String(h.recertification_id)
        const list = historyByRecert.get(key) ?? []
        list.push({
          id: String(h.id),
          event: String(h.event ?? ''),
          detail: (h.detail as string | null) ?? null,
          created_at: (h.created_at as string | null) ?? null,
        })
        historyByRecert.set(key, list)
      }
    }

    const data: EnrichedRecert[] = recerts.map((r) => {
      const employeeId = String(r.employee_id ?? '')
      const emp = empById.get(employeeId)
      const cert = certById.get(String(r.certification_id))
      const certTypeId = cert?.cert_type_id != null ? String(cert.cert_type_id) : null
      const moduleId = r.assigned_module_id != null ? String(r.assigned_module_id) : null
      return {
        id: String(r.id),
        employee_id: employeeId,
        certification_id: String(r.certification_id ?? ''),
        status: String(r.status ?? ''),
        triggered_at: (r.triggered_at as string) ?? '',
        assigned_module_id: moduleId,
        completed_at: (r.completed_at as string | null) ?? null,
        employee_name: (emp?.full_name as string | null) ?? null,
        employee_no: (emp?.employee_no as string | null) ?? null,
        department: (emp?.department as string | null) ?? null,
        cert_type: certTypeId ? certTypeName.get(certTypeId) ?? null : null,
        cert_expiry_date: cert ? ((cert.expiry_date as string | null) ?? null) : null,
        module_title: moduleId ? moduleTitle.get(moduleId) ?? null : null,
        history: historyByRecert.get(String(r.id)) ?? [],
      }
    })

    return NextResponse.json({ data })
  },
  { minRole: 'hr' },
)

export const POST = withAuth(
  async (_req: NextRequest, { companyId, appUser }) => {
    const job = await enqueueJob('recert.scan', {}, undefined, companyId)
    await recordAudit({
      companyId,
      actorId: appUser.id,
      action: 'recert.scan_enqueued',
      target: { type: 'job', id: job.id },
    })
    return NextResponse.json({ data: { jobId: job.id } }, { status: 202 })
  },
  { minRole: 'hr' },
)
