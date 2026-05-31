// compliance.refresh-status job body. Recomputes the cached status for each of a
// company's certifications and, when a cert's status flips to expired, appends an
// 'expired' history row. Pure DB work; no request context. Runs daily so
// valid -> expiring -> expired transitions happen with no user action.

import { supabaseAdmin } from '@/lib/supabase-admin'
import { calcStatus } from '@/lib/compliance/expiry'
import { writeCertHistory } from '@/services/compliance'

export interface RefreshResult {
  scanned: number
  changed: number
}

/**
 * @param companyId  the tenant to refresh; when null/empty, all tenants are scanned.
 */
export async function refreshComplianceStatus(
  companyId: string | null,
  today: Date = new Date(),
): Promise<RefreshResult> {
  let query = supabaseAdmin
    .from('ess_certifications')
    .select('id, company_id, expiry_date, status')
  if (companyId) query = query.eq('company_id', companyId)

  const { data, error } = await query
  if (error || !data) {
    return { scanned: 0, changed: 0 }
  }

  let changed = 0
  for (const cert of data as Array<{
    id: string
    company_id: string
    expiry_date: string | null
    status: string | null
  }>) {
    // 'pending' certs are managed manually; the refresh only drives the
    // valid/expiring/expired lifecycle.
    if (cert.status === 'pending') continue

    const next = calcStatus(cert.expiry_date, today)
    if (next === cert.status) continue

    await supabaseAdmin
      .from('ess_certifications')
      .update({ status: next, updated_at: today.toISOString() })
      .eq('id', cert.id)
      .eq('company_id', cert.company_id)

    // Record the meaningful lifecycle transition (expiry) in history.
    if (next === 'expired') {
      await writeCertHistory({
        certificationId: cert.id,
        action: 'expired',
        performedBy: null,
        notes: `Auto status change ${cert.status ?? 'unknown'} -> expired`,
      })
    }

    changed += 1
  }

  return { scanned: data.length, changed }
}
