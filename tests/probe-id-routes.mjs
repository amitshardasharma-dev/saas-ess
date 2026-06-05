// One-shot probe: mint 3 tokens (vol/hr/super), hit every [id] route with a
// random uuid + malformed ids, print the REAL status per route so Section D can
// encode true contracts instead of guessed ones. Minimal logins (3) to avoid
// hammering the auth endpoint.
import { readFileSync } from 'fs'

const BASE = process.env.E2E_BASE || 'https://saas-ess.vercel.app'
const F = JSON.parse(readFileSync(new URL('./fixtures/users.json', import.meta.url), 'utf8'))
const R = F.roles
const RANDOM_UUID = '00000000-0000-0000-0000-0000000000ff'

async function login(email, pwd) {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ usr: email, pwd }),
  })
  const d = await r.json().catch(() => ({}))
  if (!d.access_token) throw new Error(`login ${email} -> ${r.status} ${d.message || ''}`)
  return d.access_token
}
async function hit(tok, method, path) {
  const r = await fetch(`${BASE}${path}`, { method, headers: { Authorization: `Bearer ${tok}` } })
  let body = null
  try { body = await r.json() } catch {}
  return { status: r.status, body }
}

const ID_ROUTES = [
  ['documents/[id]', (id) => `/api/documents/${id}`, 'vol'],
  ['employee/[id]', (id) => `/api/employee/${id}`, 'vol'],
  ['appraisals/[id]', (id) => `/api/appraisals/${id}`, 'vol'],
  ['quizzes/[id]', (id) => `/api/quizzes/${id}`, 'hr'],
  ['approval-chain/[id]', (id) => `/api/approval-chain/${id}`, 'vol'],
  ['timesheets/[id]', (id) => `/api/timesheets/${id}`, 'vol'],
  ['timesheets/[id]/entries', (id) => `/api/timesheets/${id}/entries`, 'vol'],
  ['appraisal-templates/[id]', (id) => `/api/appraisal-templates/${id}`, 'hr'],
  ['appraisal-cycles/[id]', (id) => `/api/appraisal-cycles/${id}`, 'vol'],
  ['grading/[id]', (id) => `/api/grading/${id}`, 'hr'],
  ['expense-claims/[id]', (id) => `/api/expense-claims/${id}`, 'vol'],
  ['expense-claims/[id]/items', (id) => `/api/expense-claims/${id}/items`, 'vol'],
  ['certifications/[id]/file', (id) => `/api/certifications/${id}/file`, 'hr'],
  ['signed-documents/[id]/download', (id) => `/api/signed-documents/${id}/download`, 'vol'],
  ['documents/[id]/signature-status', (id) => `/api/documents/${id}/signature-status`, 'hr'],
  ['documents/[id]/fields', (id) => `/api/documents/${id}/fields`, 'vol'],
  ['documents/[id]/acknowledgments', (id) => `/api/documents/${id}/acknowledgments`, 'hr'],
  ['contracts/[id]', (id) => `/api/contracts/${id}`, 'vol'],
  ['contracts/[id]/history', (id) => `/api/contracts/${id}/history`, 'vol'],
  ['leave-applications/[id]', (id) => `/api/leave-applications/${id}`, 'vol'],
  ['training/modules/[id]', (id) => `/api/training/modules/${id}`, 'vol'],
  ['training/modules/[id]/assignments', (id) => `/api/training/modules/${id}/assignments`, 'hr'],
  ['goals/[id]', (id) => `/api/goals/${id}`, 'vol'],
]
const PLATFORM = [
  ['platform/tenants/[id]', (id) => `/api/platform/tenants/${id}`],
  ['platform/tenants/[id]/labels', (id) => `/api/platform/tenants/${id}/labels`],
  ['platform/tenants/[id]/usage', (id) => `/api/platform/tenants/${id}/usage`],
  ['platform/tenants/[id]/users', (id) => `/api/platform/tenants/${id}/users`],
]
const MALFORMED = ['not-a-uuid', '-1', '99999999999999999999999999']

const tok = {
  vol: await login(R.volunteer.email, R.volunteer.password),
  hr: await login(R.hr.email, R.hr.password),
  super: await login(R.super_admin.email, R.super_admin.password),
}
console.log('tokens minted\n')

const bodyHint = (b) => {
  if (b == null) return ''
  if (Array.isArray(b)) return `[arr:${b.length}]`
  const keys = Object.keys(b)
  const arrK = keys.find((k) => Array.isArray(b[k]))
  if (arrK) return `{${arrK}:${b[arrK].length}}`
  return `{${keys.slice(0, 3).join(',')}}`
}

console.log('=== FOREIGN/RANDOM UUID (GET) ===')
for (const [label, mk, role] of ID_ROUTES) {
  const r = await hit(tok[role], 'GET', mk(RANDOM_UUID))
  console.log(`${String(r.status).padEnd(4)} ${label.padEnd(38)} ${bodyHint(r.body)}`)
}
console.log('\n=== PLATFORM (super) RANDOM UUID ===')
for (const [label, mk] of PLATFORM) {
  const r = await hit(tok.super, 'GET', mk(RANDOM_UUID))
  console.log(`${String(r.status).padEnd(4)} ${label.padEnd(38)} ${bodyHint(r.body)}`)
}
console.log('\n=== MALFORMED (max status across bad ids) ===')
for (const [label, mk, role] of ID_ROUTES) {
  let max = 0
  for (const bad of MALFORMED) {
    const r = await hit(tok[role], 'GET', mk(encodeURIComponent(bad)))
    if (r.status > max) max = r.status
  }
  console.log(`${String(max).padEnd(4)} ${label}`)
}
