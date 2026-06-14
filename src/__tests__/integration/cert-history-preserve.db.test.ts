/**
 * @jest-environment node
 *
 * DB-integration proof for migration 059 (spec feature #9 — legally-important
 * certification audit history).
 *
 * The crux is a database-level fact, not application logic: after migration 059
 * drops the cascading FK on ess_certification_history.certification_id, a
 * 'revoked' history row written immediately BEFORE a certification is
 * hard-deleted must SURVIVE the delete (under migration 027's ON DELETE CASCADE
 * it was wiped). This test reproduces the exact DELETE-handler ordering against
 * the real dev DB using a service-role client (same pattern as tests/e2e/birch).
 *
 * It uses the REAL @supabase/supabase-js client (no jest supabase mock) because a
 * mock cannot prove referential-integrity behaviour. If the dev-DB env vars are
 * not present, the suite skips rather than failing — the same fact is also
 * covered by the manual SQL checklist in the migration report.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve } from 'path'

function readEnv(key: string): string {
  try {
    const env = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8')
    const m = env.match(new RegExp(`^${key}=(.*)$`, 'm'))
    return m ? m[1].trim() : ''
  } catch {
    return ''
  }
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || readEnv('NEXT_PUBLIC_SUPABASE_URL')
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || readEnv('SUPABASE_SERVICE_ROLE_KEY')

const hasDb = Boolean(SUPABASE_URL && SERVICE_KEY)
const describeDb = hasDb ? describe : describe.skip

describeDb('migration 059 — certification history survives a cert delete (DB)', () => {
  let sb: SupabaseClient
  let companyId: string
  let employeeId: string | null = null
  // Tracked for cleanup; nulled once the corresponding row is gone.
  let certId: string | null = null
  let historyId: string | null = null

  beforeAll(async () => {
    sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

    const { data: company } = await sb.from('ess_companies').select('id').limit(1).single()
    companyId = company!.id
    const { data: emp } = await sb
      .from('ess_employees')
      .select('id')
      .eq('company_id', companyId)
      .limit(1)
      .maybeSingle()
    employeeId = emp?.id ?? null
  })

  afterAll(async () => {
    if (historyId) await sb.from('ess_certification_history').delete().eq('id', historyId)
    if (certId) await sb.from('ess_certifications').delete().eq('id', certId)
  })

  it('a revoked history row written before delete SURVIVES the cert hard-delete, keeping its certification_id', async () => {
    // 1. create a certification (the cert the handler is about to delete)
    const { data: cert, error: certErr } = await sb
      .from('ess_certifications')
      .insert({
        company_id: companyId,
        employee_id: employeeId,
        title: 'TASK-C 059 jest proof',
        status: 'valid',
      })
      .select('id')
      .single()
    expect(certErr).toBeNull()
    expect(cert).toBeTruthy()
    certId = cert!.id
    const writtenCertId = cert!.id

    // 2. write the 'revoked' history row BEFORE the delete (exact handler order)
    const { data: hist, error: histErr } = await sb
      .from('ess_certification_history')
      .insert({
        certification_id: writtenCertId,
        action: 'revoked',
        performed_by: employeeId,
        notes: 'jest proof: written before delete',
      })
      .select('id')
      .single()
    expect(histErr).toBeNull()
    expect(hist).toBeTruthy()
    historyId = hist!.id

    // 3. hard-delete the certification (pre-059 this cascade-wiped the history row)
    const { error: delErr } = await sb.from('ess_certifications').delete().eq('id', writtenCertId)
    expect(delErr).toBeNull()
    certId = null // cert is gone — nothing to clean up for it

    // 4. ASSERT: the history row STILL EXISTS, with its original certification_id
    //    retained as a dangling-but-auditable reference.
    const { data: survivor, error: readErr } = await sb
      .from('ess_certification_history')
      .select('id, certification_id, action')
      .eq('id', historyId)
      .single()

    expect(readErr).toBeNull()
    expect(survivor).toBeTruthy()
    expect(survivor!.action).toBe('revoked')
    expect(survivor!.certification_id).toBe(writtenCertId)
  })
})
