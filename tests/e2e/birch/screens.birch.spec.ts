/**
 * Birch E2E — labeled full-page screenshots per role.
 * Drives the REAL login form (no token injection) so the captures reflect what
 * each role actually sees, then walks a small set of role-appropriate pages and
 * writes artifacts/screens/<role>/<step>.png (completion-criterion artifact).
 * Localhost/preview only (BASE guard in birch-fixtures). Single worker advised.
 */
import { test, expect, FX, BASE } from './birch-fixtures'
import { resolve } from 'path'

// Screenshots are descriptive, not assertive — a missing/blank page must not
// fail the suite (it's captured for human review). We still assert login worked.
const ART = (role: string, step: string) => resolve(process.cwd(), `artifacts/screens/${role}/${step}.png`)

async function login(page: import('@playwright/test').Page, email: string) {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
  const user = page.locator('#username')
  const pwd = page.locator('#password')
  await user.waitFor({ state: 'visible' })
  // Controlled (React) inputs: fill then assert the value actually registered
  // before submitting, so a hydration race can't submit an empty/partial form.
  await user.fill(email)
  await pwd.fill(FX.password)
  await expect(user).toHaveValue(email)
  await expect(pwd).toHaveValue(FX.password)
  await page.click('button[type="submit"]')
  // Auth lands on /dashboard (tenant roles) or /platform (super admin).
  await page.waitForURL(/\/(dashboard|platform)/, { timeout: 20000 })
}

async function shoot(page: import('@playwright/test').Page, role: string, step: string, path: string) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' }).catch(() => {})
  await page.waitForTimeout(800) // let client-side data settle
  await page.screenshot({ path: ART(role, step), fullPage: true })
}

// role key in fixtures -> ordered [step-label, route] pairs to capture
const WALKS: Record<string, [string, string][]> = {
  superadmin: [
    ['01-platform-overview', '/platform'],
    ['02-tenants', '/platform/tenants'],
    ['03-announcements', '/platform/announcements'],
  ],
  admin: [
    ['01-dashboard', '/dashboard'],
    ['02-people', '/dashboard/people'],
    ['03-compliance', '/dashboard/compliance'],
    ['04-settings', '/dashboard/settings'],
  ],
  staff: [
    ['01-dashboard', '/dashboard'],
    ['02-people', '/dashboard/people'],
    ['03-compliance', '/dashboard/compliance'],
    ['04-training-report', '/dashboard/reports/training'],
  ],
  volOutreach: [
    ['01-dashboard', '/dashboard'],
    ['02-onboarding', '/dashboard/onboarding'],
    ['03-training', '/dashboard/training'],
  ],
  volOpshop: [
    ['01-dashboard', '/dashboard'],
    ['02-onboarding', '/dashboard/onboarding'],
  ],
}

for (const [roleKey, walk] of Object.entries(WALKS)) {
  test(`screens: ${roleKey}`, async ({ page }) => {
    const u = FX.users[roleKey]
    expect(u, `fixture user "${roleKey}" missing`).toBeTruthy()
    await login(page, u.email)
    for (const [step, path] of walk) {
      await shoot(page, roleKey, step, path)
    }
  })
}
