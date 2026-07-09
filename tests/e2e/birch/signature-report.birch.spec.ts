/**
 * Birch E2E — admin signature report: who signed a signable document, admin
 * download of a signed copy, and RBAC (volunteers can't see the report or send
 * reminders). Read-only + a single reminder call is NOT made here to avoid
 * polluting the shared inbox that other specs count.
 */
import { test, expect, tokenFor, api, FX, sbAdmin } from './birch-fixtures'

test.describe('admin signature report', () => {
  let docId = ''

  test.beforeAll(async () => {
    // A signable document in the tenant = one whose version has e-sign fields.
    const { data: docs } = await sbAdmin.from('ess_documents').select('id').eq('company_id', FX.companyId)
    for (const d of docs ?? []) {
      const { data: vers } = await sbAdmin.from('ess_document_versions').select('id').eq('document_id', d.id)
      const versionIds = (vers ?? []).map((v) => v.id as string)
      if (!versionIds.length) continue
      const { count } = await sbAdmin.from('ess_document_fields').select('id', { count: 'exact', head: true }).in('version_id', versionIds)
      if ((count ?? 0) > 0) { docId = d.id as string; break }
    }
  })

  test('admin sees who signed / who has not, with a downloadable signed copy', async () => {
    test.skip(!docId, 'no signable document seeded')
    const admin = await tokenFor(FX.users.admin.email)

    const res = await api(admin, 'GET', `/api/documents/${docId}/signature-status`)
    expect(res.status, JSON.stringify(res.body)).toBe(200)
    const body = res.body as { total: number; signed_count: number; employees: Array<{ signed: boolean; signed_document_id: string | null }> }
    expect(body.total).toBeGreaterThan(0)
    expect(Array.isArray(body.employees)).toBe(true)
    // Every signed row exposes a signed_document_id the admin can download.
    const signed = body.employees.filter((e) => e.signed)
    for (const s of signed) expect(s.signed_document_id).toBeTruthy()

    if (signed[0]?.signed_document_id) {
      const dl = await api(admin, 'GET', `/api/signed-documents/${signed[0].signed_document_id}/download`)
      expect(dl.status).toBe(200)
      expect((dl.body as { url?: string }).url).toBeTruthy()
    }
  })

  test('volunteers cannot view the signature report or send reminders', async () => {
    test.skip(!docId, 'no signable document seeded')
    const vol = await tokenFor(FX.users.volOutreach.email)
    expect((await api(vol, 'GET', `/api/documents/${docId}/signature-status`)).status).toBe(403)
    expect((await api(vol, 'POST', `/api/documents/${docId}/remind-unsigned`, {})).status).toBe(403)
  })
})
