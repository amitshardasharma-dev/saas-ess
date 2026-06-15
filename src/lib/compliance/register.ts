// Compliance Document Register engine: resolve each person's REQUIRED
// certificates + trainings (from ess_compliance_requirements, matched by
// tier/group) and compute a traffic-light status for each — RED until the
// certificate is validated or the training is completed (and again on expiry).
import { supabaseAdmin } from '@/lib/supabase-admin'
import type { UserRole } from '@/types/roles'
import { calcStatus } from '@/lib/compliance/expiry'
import { requirementApplies, type ComplianceRequirement } from '@/types/compliance-register'
import type { VerificationStatus } from '@/types/compliance'

export type ItemColor = 'green' | 'amber' | 'red'
export type CertState = 'missing' | 'pending_review' | 'changes_requested' | 'rejected' | 'validated' | 'expired'
export type TrainingState = 'not_started' | 'in_progress' | 'complete' | 'expired'

export interface RegisterCertItem {
  cert_type_id: string
  name: string
  requires_file: boolean
  certification_id: string | null
  verification_status: VerificationStatus | null
  expiry_date: string | null
  has_file: boolean
  state: CertState
  color: ItemColor
  label: string
}

export interface RegisterTrainingItem {
  module_id: string
  title: string
  status: TrainingState
  percent: number
  expires_at: string | null
  color: ItemColor
  label: string
}

export interface PersonCompliance {
  employee_id: string
  name: string | null
  role: UserRole
  certificates: RegisterCertItem[]
  trainings: RegisterTrainingItem[]
  total: number
  complete: number
  pending: number
}

export interface RegisterEmployee {
  id: string
  name: string | null
  role: UserRole
}

export async function loadRequirements(companyId: string): Promise<ComplianceRequirement[]> {
  const { data } = await supabaseAdmin
    .from('ess_compliance_requirements')
    .select('*')
    .eq('company_id', companyId)
  return (data ?? []) as ComplianceRequirement[]
}

/** Module ids a person is REQUIRED to complete (for the learning-view union). */
export async function requiredModuleIdsForEmployee(
  companyId: string,
  employeeId: string,
  role: UserRole,
): Promise<string[]> {
  const reqs = await loadRequirements(companyId)
  if (reqs.length === 0) return []
  const { data: gm } = await supabaseAdmin
    .from('ess_training_group_members')
    .select('group_id')
    .eq('company_id', companyId)
    .eq('employee_id', employeeId)
  const groupIds = (gm ?? []).map((r) => r.group_id as string)
  return [
    ...new Set(
      reqs
        .filter((r) => r.kind === 'training' && requirementApplies(r, role, groupIds))
        .map((r) => r.ref_id),
    ),
  ]
}

function certRank(vs: VerificationStatus | null | undefined): number {
  if (vs === 'validated') return 3
  if (vs === 'submitted' || vs === 'pending') return 2
  return 1 // changes_requested / rejected / none
}

function buildCertItem(
  certTypeId: string,
  meta: { name: string; requires_file: boolean },
  cert: { id: string; verification_status: VerificationStatus | null; expiry_date: string | null; file_url: string | null } | null,
): RegisterCertItem {
  const base = {
    cert_type_id: certTypeId,
    name: meta.name,
    requires_file: meta.requires_file,
    certification_id: cert?.id ?? null,
    verification_status: cert?.verification_status ?? null,
    expiry_date: cert?.expiry_date ?? null,
    has_file: Boolean(cert?.file_url),
  }
  if (!cert) return { ...base, state: 'missing', color: 'red', label: 'Not uploaded' }
  const vs = cert.verification_status
  if (vs === 'validated') {
    const exp = calcStatus(cert.expiry_date)
    if (exp === 'expired') return { ...base, state: 'expired', color: 'red', label: 'Expired' }
    return { ...base, state: 'validated', color: 'green', label: exp === 'expiring' ? 'Valid · expiring soon' : 'Validated' }
  }
  if (vs === 'submitted' || vs === 'pending') return { ...base, state: 'pending_review', color: 'amber', label: 'Pending review' }
  if (vs === 'changes_requested') return { ...base, state: 'changes_requested', color: 'red', label: 'Changes requested' }
  if (vs === 'rejected') return { ...base, state: 'rejected', color: 'red', label: 'Rejected' }
  return { ...base, state: 'missing', color: 'red', label: 'Not uploaded' }
}

function buildTrainingItem(
  moduleId: string,
  title: string,
  prog: { status: string; percent_complete: number; expires_at: string | null } | null,
  now: Date,
): RegisterTrainingItem {
  const percent = Math.round(prog?.percent_complete ?? 0)
  const expires_at = prog?.expires_at ?? null
  if (!prog || prog.status === 'not_started') {
    return { module_id: moduleId, title, status: 'not_started', percent, expires_at, color: 'red', label: 'Not started' }
  }
  if (prog.status === 'in_progress') {
    return { module_id: moduleId, title, status: 'in_progress', percent, expires_at, color: 'amber', label: `In progress · ${percent}%` }
  }
  // complete
  if (expires_at && new Date(expires_at) <= now) {
    return { module_id: moduleId, title, status: 'expired', percent, expires_at, color: 'red', label: 'Expired — redo' }
  }
  return { module_id: moduleId, title, status: 'complete', percent: 100, expires_at, color: 'green', label: 'Completed' }
}

/**
 * Build the register for a set of employees in a handful of batched queries
 * (scales to a whole company). Pass a single employee for the "my" view.
 */
export async function buildRegister(companyId: string, employees: RegisterEmployee[]): Promise<PersonCompliance[]> {
  if (employees.length === 0) return []
  const now = new Date()
  const empIds = employees.map((e) => e.id)
  const reqs = await loadRequirements(companyId)

  // Group memberships for these employees.
  const groupsByEmp = new Map<string, string[]>()
  if (reqs.some((r) => r.target_type === 'group')) {
    const { data: gm } = await supabaseAdmin
      .from('ess_training_group_members')
      .select('employee_id, group_id')
      .eq('company_id', companyId)
      .in('employee_id', empIds)
    for (const r of gm ?? []) {
      const arr = groupsByEmp.get(r.employee_id as string) ?? []
      arr.push(r.group_id as string)
      groupsByEmp.set(r.employee_id as string, arr)
    }
  }

  // Referenced cert types + modules (names / flags).
  const certTypeIds = [...new Set(reqs.filter((r) => r.kind === 'certification').map((r) => r.ref_id))]
  const moduleIds = [...new Set(reqs.filter((r) => r.kind === 'training').map((r) => r.ref_id))]
  const certTypes = new Map<string, { name: string; requires_file: boolean }>()
  if (certTypeIds.length) {
    const { data } = await supabaseAdmin.from('ess_cert_types').select('id, name, requires_file').in('id', certTypeIds)
    for (const t of data ?? []) certTypes.set(t.id as string, { name: (t as { name?: string }).name ?? '', requires_file: Boolean((t as { requires_file?: boolean }).requires_file) })
  }
  const moduleTitles = new Map<string, string>()
  if (moduleIds.length) {
    const { data } = await supabaseAdmin.from('ess_training_modules').select('id, title').in('id', moduleIds)
    for (const m of data ?? []) moduleTitles.set(m.id as string, (m as { title?: string }).title ?? '')
  }

  // Per-person certs (best cert per type) + training progress.
  const certByEmpType = new Map<string, { id: string; verification_status: VerificationStatus | null; expiry_date: string | null; file_url: string | null }>()
  if (certTypeIds.length) {
    const { data: certs } = await supabaseAdmin
      .from('ess_certifications')
      .select('id, employee_id, cert_type_id, verification_status, expiry_date, file_url, created_at')
      .eq('company_id', companyId)
      .in('employee_id', empIds)
      .in('cert_type_id', certTypeIds)
    for (const c of certs ?? []) {
      const key = `${c.employee_id}:${c.cert_type_id}`
      const existing = certByEmpType.get(key)
      const cur = c as { id: string; verification_status: VerificationStatus | null; expiry_date: string | null; file_url: string | null; created_at: string }
      // Prefer validated, then the most recent record.
      if (!existing) certByEmpType.set(key, cur)
      else {
        const better = certRank(cur.verification_status) > certRank(existing.verification_status)
        certByEmpType.set(key, better ? cur : existing)
      }
    }
  }
  const progByEmpModule = new Map<string, { status: string; percent_complete: number; expires_at: string | null }>()
  if (moduleIds.length) {
    const { data: prog } = await supabaseAdmin
      .from('ess_training_progress')
      .select('employee_id, module_id, status, percent_complete, expires_at')
      .eq('company_id', companyId)
      .in('employee_id', empIds)
      .in('module_id', moduleIds)
    for (const p of prog ?? []) {
      progByEmpModule.set(`${p.employee_id}:${p.module_id}`, p as { status: string; percent_complete: number; expires_at: string | null })
    }
  }

  return employees.map((emp) => {
    const groupIds = groupsByEmp.get(emp.id) ?? []
    const myReqs = reqs.filter((r) => requirementApplies(r, emp.role, groupIds))
    const myCertTypeIds = [...new Set(myReqs.filter((r) => r.kind === 'certification').map((r) => r.ref_id))]
    const myModuleIds = [...new Set(myReqs.filter((r) => r.kind === 'training').map((r) => r.ref_id))]

    const certificates = myCertTypeIds
      .map((ctId) => {
        const meta = certTypes.get(ctId)
        if (!meta) return null
        return buildCertItem(ctId, meta, certByEmpType.get(`${emp.id}:${ctId}`) ?? null)
      })
      .filter((x): x is RegisterCertItem => x !== null)

    const trainings = myModuleIds
      .map((mId) => {
        const title = moduleTitles.get(mId)
        if (title === undefined) return null
        return buildTrainingItem(mId, title, progByEmpModule.get(`${emp.id}:${mId}`) ?? null, now)
      })
      .filter((x): x is RegisterTrainingItem => x !== null)

    const all: ItemColor[] = [...certificates.map((c) => c.color), ...trainings.map((t) => t.color)]
    const total = all.length
    const complete = all.filter((c) => c === 'green').length
    return {
      employee_id: emp.id,
      name: emp.name,
      role: emp.role,
      certificates,
      trainings,
      total,
      complete,
      pending: total - complete,
    }
  })
}
