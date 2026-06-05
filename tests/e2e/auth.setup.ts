/**
 * Auth setup project: logs each of the 5 underlying roles in once and writes a
 * storageState file the per-role projects reuse. Runs before all role projects
 * (declared as their dependency in playwright.config.ts).
 */
import { test as setup, expect } from '@playwright/test'
import { mkdirSync } from 'fs'
import { loginByApi, ROLE_USERS } from './fixtures'
import { STORAGE_DIR } from '../../playwright.config'

const ROLES = ['super_admin', 'admin', 'hr', 'manager', 'volunteer'] as const

mkdirSync(STORAGE_DIR, { recursive: true })

for (const role of ROLES) {
  setup(`authenticate ${role}`, async ({ page }) => {
    const u = ROLE_USERS[role]
    expect(u, `fixture for role ${role} (run: npx tsx tests/seed.ts)`).toBeTruthy()
    const res = await loginByApi(page, u.email, u.password)
    expect(res.status, `login ${u.email}`).toBe(200)
    expect(res.role).toBe(u.role)
    await page.context().storageState({ path: `${STORAGE_DIR}/${role}.json` })
  })
}
