/**
 * Birch E2E — volunteer SELF-SERVICE certificate document upload.
 *
 * Before this, volunteers had no way to upload the actual evidence file for a
 * certification they hold (Police Check, Blue Card, …): the only file route was
 * hr-gated. This proves the self-scoped file route end-to-end and guards its
 * security:
 *   - a volunteer uploads a document to their own cert and reads it back via a
 *     signed URL;
 *   - a volunteer CANNOT upload to (or read) another volunteer's cert (404, IDOR).
 *
 * The cert ROWS are seeded directly via the service-role client (not the create
 * API) on purpose: this isolates the test to the new file route and avoids the
 * create API's onboarding auto-complete side-effect, which would otherwise mutate
 * a shared volunteer's onboarding state and flake the seed-dependent specs.
 */
import { test, expect, tokenFor, api, FX, sbAdmin, BASE } from './birch-fixtures'
import { request } from '@playwright/test'

const TITLE_PREFIX = 'E2E self-cert upload'
// A tiny but valid-enough PDF payload; the route only stores the bytes.
const PDF_BYTES = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n', 'utf8')

// Certs created by THIS worker only. Cleaning up by tracked id (not by shared
// title prefix) keeps parallel workers from deleting each other's in-flight rows.
const createdCertIds: string[] = []

// Seed a cert row directly (no onboarding hook). Returns the new id.
async function seedCert(employeeId: string, certTypeId: string, suffix: string): Promise<string> {
  const { data, error } = await sbAdmin
    .from('ess_certifications')
    .insert({
      company_id: FX.companyId,
      employee_id: employeeId,
      cert_type_id: certTypeId,
      title: `${TITLE_PREFIX} ${suffix}`,
      completion_date: '2026-01-15',
      expiry_date: '2027-01-15',
      status: 'valid',
      created_by: employeeId,
    })
    .select('id')
    .single()
  if (error || !data) throw new Error(`seed cert failed: ${error?.message}`)
  const id = data.id as string
  createdCertIds.push(id)
  return id
}

// Upload a multipart file with a bearer token (the JSON `api` helper can't).
async function uploadFile(token: string, certId: string) {
  const ctx = await request.newContext({ baseURL: BASE })
  const r = await ctx.fetch(`/api/profile/certifications/${certId}/file`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    multipart: { file: { name: 'police-check.pdf', mimeType: 'application/pdf', buffer: PDF_BYTES } },
  })
  const status = r.status()
  let body: Record<string, unknown> | null = null
  try { body = (await r.json()) as Record<string, unknown> } catch {}
  await ctx.dispose()
  return { status, body }
}

// Remove only the certs THIS worker created (+ their storage objects + history).
test.afterAll(async () => {
  if (createdCertIds.length === 0) return
  const { data } = await sbAdmin
    .from('ess_certifications')
    .select('id, file_url')
    .in('id', createdCertIds)
  const certs = data ?? []
  const paths = certs.map((c) => c.file_url as string | null).filter((p): p is string => Boolean(p))
  if (paths.length) await sbAdmin.storage.from('certifications').remove(paths)
  await sbAdmin.from('ess_certification_history').delete().in('certification_id', createdCertIds)
  await sbAdmin.from('ess_certifications').delete().in('id', createdCertIds)
})

test('volunteer uploads a document to their own certification and reads it back', async () => {
  const tok = await tokenFor(FX.users.volOutreach.email)
  const certId = await seedCert(FX.users.volOutreach.employeeId, FX.onboarding.certTypes.policeCheck, `${Date.now()}`)

  // 1) Upload the evidence document to the caller's own cert.
  const up = await uploadFile(tok, certId)
  expect([200, 201], `upload -> ${up.status}: ${JSON.stringify(up.body)}`).toContain(up.status)
  expect((up.body as { file_name?: string })?.file_name).toBe('police-check.pdf')

  // 2) The row now points at a stored object, still scoped to this volunteer.
  const { data: row } = await sbAdmin
    .from('ess_certifications')
    .select('file_url, file_name, employee_id')
    .eq('id', certId)
    .single()
  expect(row?.file_url, 'file_url persisted').toBeTruthy()
  expect(row?.employee_id, 'cert belongs to the uploading volunteer').toBe(FX.users.volOutreach.employeeId)

  // 3) The volunteer can read it back via a short-lived signed URL.
  const get = await api(tok, 'GET', `/api/profile/certifications/${certId}/file`)
  expect(get.status, `get -> ${get.status}: ${JSON.stringify(get.body)}`).toBe(200)
  expect((get.body as { url?: string })?.url, 'signed URL returned').toBeTruthy()
})

test('a volunteer cannot upload to or read another volunteer\'s certification (IDOR)', async () => {
  const opshopTok = await tokenFor(FX.users.volOpshop.email)
  // A cert owned by volOutreach…
  const certId = await seedCert(FX.users.volOutreach.employeeId, FX.onboarding.certTypes.blueCard, `idor ${Date.now()}`)

  // …volOpshop must not be able to attach to it or read it.
  const up = await uploadFile(opshopTok, certId)
  expect(up.status, 'cross-volunteer upload must 404 (no IDOR)').toBe(404)

  const get = await api(opshopTok, 'GET', `/api/profile/certifications/${certId}/file`)
  expect(get.status, 'cross-volunteer read must 404 (no IDOR)').toBe(404)

  // Sanity: the failed attack left no file on the owner's cert.
  const { data: row } = await sbAdmin.from('ess_certifications').select('file_url').eq('id', certId).single()
  expect(row?.file_url, 'failed IDOR upload left no file').toBeFalsy()
})
