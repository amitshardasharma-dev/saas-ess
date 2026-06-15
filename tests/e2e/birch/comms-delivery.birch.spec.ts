/**
 * Birch E2E — Communications DELIVERY (regression guard).
 * The prior suite only checked the send GATE (auth), not that messages actually
 * reach recipients. A schema bug (resolveRecipients filtered ess_employees by a
 * non-existent is_active column) made every targeted send resolve to ZERO
 * recipients — sent, but delivered to nobody. This proves the chain end-to-end:
 * admin send-to-all -> recipient rows created -> a specific volunteer receives it.
 */
import { test, expect, api, tokenFor, FX, sbAdmin } from './birch-fixtures'

test('admin "send to all" is delivered to volunteers (recipient rows created)', async () => {
  const adminTok = await tokenFor(FX.users.admin.email)
  const subject = `E2E delivery check ${Date.now()}`

  const send = await api(adminTok, 'POST', '/api/communications', {
    subject,
    body_html: '<p>Hello everyone</p>',
    targets: [{ target_type: 'all' }],
    draft: false,
    send_email: false,
  })
  expect([200, 201], `send -> ${send.status}: ${JSON.stringify(send.body)}`).toContain(send.status)
  const allCount = Number((send.body?.data as { recipientCount?: number } | undefined)?.recipientCount ?? 0)
  expect(allCount, 'send-to-all must resolve > 0 recipients').toBeGreaterThan(0)

  // Definitive: the message exists and a specific volunteer has an inbox recipient row.
  const { data: msg } = await sbAdmin
    .from('ess_messages')
    .select('id')
    .eq('company_id', FX.companyId)
    .eq('subject', subject)
    .single()
  expect(msg?.id, 'sent message should exist').toBeTruthy()

  const { data: recs } = await sbAdmin
    .from('ess_message_recipients')
    .select('employee_id')
    .eq('message_id', msg!.id)
    .eq('employee_id', FX.users.volOpshop.employeeId)
  expect((recs ?? []).length, 'volunteer should have an inbox recipient row after send-to-all').toBe(1)
})

test('org_unit target delivers to that department only', async () => {
  const adminTok = await tokenFor(FX.users.admin.email)
  const subject = `E2E outreach-only ${Date.now()}`
  const send = await api(adminTok, 'POST', '/api/communications', {
    subject,
    body_html: '<p>Outreach team</p>',
    targets: [{ target_type: 'org_unit', target_value: 'Street Outreach' }],
    draft: false,
    send_email: false,
  })
  expect([200, 201]).toContain(send.status)
  const cnt = Number((send.body?.data as { recipientCount?: number } | undefined)?.recipientCount ?? 0)
  expect(cnt, 'Street Outreach should resolve > 0').toBeGreaterThan(0)

  const { data: msg } = await sbAdmin
    .from('ess_messages').select('id').eq('company_id', FX.companyId).eq('subject', subject).single()
  // The Street-Outreach volunteer gets it; the Op-Shop volunteer does NOT.
  const got = async (employeeId: string) => {
    const { data } = await sbAdmin.from('ess_message_recipients').select('employee_id').eq('message_id', msg!.id).eq('employee_id', employeeId)
    return (data ?? []).length
  }
  expect(await got(FX.users.volOutreach.employeeId), 'Street Outreach vol receives it').toBe(1)
  expect(await got(FX.users.volOpshop.employeeId), 'Op Shop vol must NOT receive an Outreach-only message').toBe(0)
})
