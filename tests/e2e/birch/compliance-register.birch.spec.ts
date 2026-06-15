/**
 * Birch E2E — Compliance Document Register.
 * Covers: requirement-management gating (admin only), per-person register
 * resolution + traffic-light status (RED until done, GREEN when validated/
 * completed, RED again on training expiry), and certificate validation routing
 * (no self-validate; a staff member's cert needs an admin).
 *
 * Seeds via the service-role client to isolate from the create API's onboarding
 * side-effects. Serial: shared seed module + single cleanup.
 */
import { test, expect, tokenFor, api, FX, sbAdmin } from './birch-fixtures'

test.describe.configure({ mode: 'serial' })

const PREFIX = 'E2E Register'
let moduleId = ''
let certTypeId = '' // dedicated throwaway type so other specs' certs can't interfere
const reqIds: string[] = []
const certIds: string[] = []

test.beforeAll(async () => {
  const { data: mod } = await sbAdmin
    .from('ess_training_modules')
    .insert({ company_id: FX.companyId, title: `${PREFIX} Module`, status: 'published', validity_months: 12 })
    .select('id')
    .single()
  moduleId = mod!.id as string

  const { data: ct } = await sbAdmin
    .from('ess_cert_types')
    .insert({ company_id: FX.companyId, name: `${PREFIX} Cert`, validity_months: 24, requires_file: false, required: false, reminder_offsets: [] })
    .select('id')
    .single()
  certTypeId = ct!.id as string
})

test.afterAll(async () => {
  if (reqIds.length) await sbAdmin.from('ess_compliance_requirements').delete().in('id', reqIds)
  if (certIds.length) await sbAdmin.from('ess_certifications').delete().in('id', certIds)
  if (certTypeId) await sbAdmin.from('ess_cert_types').delete().eq('id', certTypeId)
  if (moduleId) await sbAdmin.from('ess_training_modules').delete().eq('id', moduleId) // cascades progress/items
  const { data: msgs } = await sbAdmin.from('ess_messages').select('id').eq('company_id', FX.companyId).like('subject', `%${PREFIX}%`)
  const ids = (msgs ?? []).map((m) => m.id as string)
  if (ids.length) {
    await sbAdmin.from('ess_message_recipients').delete().in('message_id', ids)
    await sbAdmin.from('ess_messages').delete().in('id', ids)
  }
})

async function addRequirement(adminTok: string, kind: 'certification' | 'training', refId: string) {
  const res = await api(adminTok, 'POST', '/api/compliance/requirements', { kind, ref_id: refId, target_type: 'tier', target_value: 'volunteer' })
  if (res.status === 201) {
    const id = (res.body?.requirement as { id?: string } | undefined)?.id
    if (id) reqIds.push(id)
  }
  return res
}

async function seedCert(employeeId: string, certTypeId: string, verification: string, expiry: string, suffix: string) {
  const { data } = await sbAdmin
    .from('ess_certifications')
    .insert({ company_id: FX.companyId, employee_id: employeeId, cert_type_id: certTypeId, title: `${PREFIX} ${suffix}`, expiry_date: expiry, status: 'valid', verification_status: verification, created_by: employeeId })
    .select('id')
    .single()
  certIds.push(data!.id as string)
  return data!.id as string
}

test('requirement management is admin-only', async () => {
  const volTok = await tokenFor(FX.users.volOutreach.email)
  const staffTok = await tokenFor(FX.users.staff.email)
  const adminTok = await tokenFor(FX.users.admin.email)

  expect((await api(volTok, 'POST', '/api/compliance/requirements', { kind: 'certification', ref_id: FX.onboarding.certTypes.policeCheck, target_type: 'tier', target_value: 'volunteer' })).status).toBe(403)
  expect((await api(staffTok, 'POST', '/api/compliance/requirements', { kind: 'certification', ref_id: FX.onboarding.certTypes.policeCheck, target_type: 'tier', target_value: 'volunteer' })).status).toBe(403)

  expect((await addRequirement(adminTok, 'certification', certTypeId)).status).toBe(201)
  expect((await addRequirement(adminTok, 'training', moduleId)).status).toBe(201)
})

test('register resolves required items with RED→GREEN→RED(expired) status', async () => {
  const volTok = await tokenFor(FX.users.volOutreach.email)
  const empId = FX.users.volOutreach.employeeId

  // Initially: cert missing (red) + training not started (red).
  let reg = await api(volTok, 'GET', '/api/compliance/register')
  let me = reg.body?.me as { certificates: { cert_type_id: string; color: string }[]; trainings: { module_id: string; color: string }[] }
  const cert0 = me.certificates.find((c) => c.cert_type_id === certTypeId)
  const train0 = me.trainings.find((t) => t.module_id === moduleId)
  expect(cert0?.color, 'missing cert is red').toBe('red')
  expect(train0?.color, 'unstarted training is red').toBe('red')

  // Validate a cert -> green.
  await seedCert(empId, certTypeId, 'validated', '2030-01-01', 'DedicatedCert')
  reg = await api(volTok, 'GET', '/api/compliance/register')
  me = reg.body?.me as typeof me
  expect(me.certificates.find((c) => c.cert_type_id === certTypeId)?.color, 'validated cert is green').toBe('green')

  // Complete the training -> green.
  await sbAdmin.from('ess_training_progress').upsert(
    { company_id: FX.companyId, employee_id: empId, module_id: moduleId, status: 'complete', percent_complete: 100, expires_at: '2030-01-01T00:00:00Z' },
    { onConflict: 'employee_id,module_id' },
  )
  reg = await api(volTok, 'GET', '/api/compliance/register')
  me = reg.body?.me as typeof me
  expect(me.trainings.find((t) => t.module_id === moduleId)?.color, 'completed training is green').toBe('green')

  // Expire the training -> red again.
  await sbAdmin.from('ess_training_progress').update({ expires_at: '2020-01-01T00:00:00Z' }).eq('employee_id', empId).eq('module_id', moduleId)
  reg = await api(volTok, 'GET', '/api/compliance/register')
  me = reg.body?.me as typeof me
  const trainExpired = me.trainings.find((t) => t.module_id === moduleId)
  expect(trainExpired?.color, 'expired training is red').toBe('red')

  // Clean the progress row we made (module delete also cascades, but be tidy).
  await sbAdmin.from('ess_training_progress').delete().eq('employee_id', empId).eq('module_id', moduleId)
})

test('validation routing: no self-validate; staff cert needs an admin', async () => {
  const staffTok = await tokenFor(FX.users.staff.email)
  const adminTok = await tokenFor(FX.users.admin.email)

  // A staff member cannot validate their OWN cert.
  const staffCert = await seedCert(FX.users.staff.employeeId, FX.onboarding.certTypes.blueCard, 'submitted', '2030-01-01', 'StaffOwn')
  expect((await api(staffTok, 'POST', `/api/certifications/${staffCert}/review`, { action: 'validate' })).status, 'staff self-validate blocked').toBe(403)

  // An admin CAN validate a staff member's cert.
  expect((await api(adminTok, 'POST', `/api/certifications/${staffCert}/review`, { action: 'validate' })).status, 'admin validates staff cert').toBe(200)

  // Staff CAN validate a volunteer's cert.
  const volCert = await seedCert(FX.users.volOutreach.employeeId, FX.onboarding.certTypes.policeCheck, 'submitted', '2030-01-01', 'VolForStaff')
  expect((await api(staffTok, 'POST', `/api/certifications/${volCert}/review`, { action: 'validate' })).status, 'staff validates volunteer cert').toBe(200)
})
