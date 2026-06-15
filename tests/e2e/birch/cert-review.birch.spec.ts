/**
 * Birch E2E — certificate review workflow (admin/HR validation + per-cert thread
 * + volunteer inbox notification).
 *
 * Proves the chain the feature is built for:
 *   - a reviewer (hr) validates a submitted cert (status -> validated, expiry can
 *     be overridden) and the volunteer is notified in their inbox;
 *   - request-changes -> the volunteer replies on the same cert -> it returns to
 *     'submitted' (re-enters the review queue);
 *   - access control: a non-owner volunteer can't read the thread (404), and a
 *     volunteer can't review (403, hr+ only).
 *
 * Cert ROWS are seeded directly via the service-role client (not the create API)
 * to isolate this from the create API's onboarding side-effect.
 */
import { test, expect, tokenFor, api, FX, sbAdmin } from './birch-fixtures'

// Serial: these tests share the volunteer's inbox + a single afterAll cleanup
// (notification rows are created server-side, so they can't be tracked by id like
// the cert rows). Serial keeps a parallel worker's afterAll from deleting another
// test's in-flight inbox notification.
test.describe.configure({ mode: 'serial' })

const TITLE_PREFIX = 'E2E review'
const createdCertIds: string[] = []

async function seedSubmittedCert(employeeId: string, certTypeId: string, suffix: string): Promise<string> {
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
      verification_status: 'submitted',
      created_by: employeeId,
    })
    .select('id')
    .single()
  if (error || !data) throw new Error(`seed cert failed: ${error?.message}`)
  createdCertIds.push(data.id as string)
  return data.id as string
}

test.afterAll(async () => {
  if (createdCertIds.length) {
    // cert_messages + cert_history cascade on cert delete (ON DELETE CASCADE).
    await sbAdmin.from('ess_certifications').delete().in('id', createdCertIds)
  }
  // Remove the inbox notifications this spec generated.
  const { data: msgs } = await sbAdmin
    .from('ess_messages')
    .select('id')
    .eq('company_id', FX.companyId)
    .like('subject', `%${TITLE_PREFIX}%`)
  const ids = (msgs ?? []).map((m) => m.id as string)
  if (ids.length) {
    await sbAdmin.from('ess_message_recipients').delete().in('message_id', ids)
    await sbAdmin.from('ess_messages').delete().in('id', ids)
  }
})

test('reviewer validates a submission, overrides expiry, and notifies the volunteer', async () => {
  const staffTok = await tokenFor(FX.users.staff.email)
  const volTok = await tokenFor(FX.users.volOutreach.email)
  const certId = await seedSubmittedCert(FX.users.volOutreach.employeeId, FX.onboarding.certTypes.policeCheck, `${Date.now()}`)

  const review = await api(staffTok, 'POST', `/api/certifications/${certId}/review`, {
    action: 'validate',
    expiry_date: '2028-03-01',
    message: 'Verified against the original — approved.',
  })
  expect(review.status, `review -> ${review.status}: ${JSON.stringify(review.body)}`).toBe(200)
  expect((review.body?.certification as { verification_status?: string })?.verification_status).toBe('validated')

  // Expiry override persisted.
  const { data: row } = await sbAdmin.from('ess_certifications').select('verification_status, expiry_date, verified_by').eq('id', certId).single()
  expect(row?.verification_status).toBe('validated')
  expect(row?.expiry_date).toBe('2028-03-01')
  expect(row?.verified_by, 'reviewer recorded').toBeTruthy()

  // The reviewer note is in the thread.
  const thread = await api(staffTok, 'GET', `/api/certifications/${certId}/messages`)
  const messages = (thread.body?.messages ?? []) as Array<{ author_kind: string; body: string }>
  expect(messages.some((m) => m.author_kind === 'reviewer' && /approved/i.test(m.body)), 'reviewer note recorded').toBe(true)

  // The volunteer is notified in their inbox.
  const inbox = await api(volTok, 'GET', '/api/communications/inbox')
  const items = (inbox.body?.data ?? []) as Array<{ subject: string }>
  expect(items.some((m) => m.subject.includes(TITLE_PREFIX)), 'volunteer notified in inbox').toBe(true)
})

test('request changes -> volunteer reply re-opens the cert for review', async () => {
  const staffTok = await tokenFor(FX.users.staff.email)
  const volTok = await tokenFor(FX.users.volOutreach.email)
  const certId = await seedSubmittedCert(FX.users.volOutreach.employeeId, FX.onboarding.certTypes.blueCard, `changes ${Date.now()}`)

  const review = await api(staffTok, 'POST', `/api/certifications/${certId}/review`, {
    action: 'request_changes',
    message: 'The scan is blurry — please re-upload.',
  })
  expect(review.status).toBe(200)
  const { data: afterReview } = await sbAdmin.from('ess_certifications').select('verification_status').eq('id', certId).single()
  expect(afterReview?.verification_status).toBe('changes_requested')

  // Owner replies on their own cert.
  const reply = await api(volTok, 'POST', `/api/certifications/${certId}/messages`, { body: 'Re-uploaded a clearer copy, thanks.' })
  expect(reply.status, `reply -> ${reply.status}: ${JSON.stringify(reply.body)}`).toBe(201)

  // An owner reply re-opens the cert (back into the reviewers' queue).
  const { data: afterReply } = await sbAdmin.from('ess_certifications').select('verification_status').eq('id', certId).single()
  expect(afterReply?.verification_status).toBe('submitted')

  // Both voices are in the thread.
  const thread = await api(staffTok, 'GET', `/api/certifications/${certId}/messages`)
  const kinds = ((thread.body?.messages ?? []) as Array<{ author_kind: string }>).map((m) => m.author_kind)
  expect(kinds).toContain('reviewer')
  expect(kinds).toContain('owner')
})

test('access control: non-owner cannot read the thread; volunteers cannot review', async () => {
  const opshopTok = await tokenFor(FX.users.volOpshop.email)
  const certId = await seedSubmittedCert(FX.users.volOutreach.employeeId, FX.onboarding.certTypes.policeCheck, `idor ${Date.now()}`)

  // A different volunteer can't read someone else's review thread.
  const peek = await api(opshopTok, 'GET', `/api/certifications/${certId}/messages`)
  expect(peek.status, 'cross-volunteer thread read must 404').toBe(404)

  // …and can't act as a reviewer (hr+ only).
  const review = await api(opshopTok, 'POST', `/api/certifications/${certId}/review`, { action: 'validate' })
  expect(review.status, 'volunteer cannot review (403)').toBe(403)
})
