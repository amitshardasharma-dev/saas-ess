import { defineConfig, devices } from '@playwright/test'

/**
 * E2E config for the Volunteer Management platform.
 *
 * Target: E2E_BASE (defaults to the live deployment). Override locally with
 *   E2E_BASE=http://localhost:3001 pnpm exec playwright test
 *
 * Roles: a `setup` project logs each of the 5 underlying roles in once (via the
 * real /api/auth/login) and saves a storageState file; every role project then
 * reuses that authenticated state. hr and manager are SEPARATE projects because
 * 55 routes are gated minRole:'hr' (a manager is denied where hr is allowed).
 *
 * Reporters: HTML (primary) + JSON + list; traces/screenshots/video on failure.
 */

const BASE = process.env.E2E_BASE || 'https://saas-ess.vercel.app'
export const STORAGE_DIR = 'test-results/storage'

const ROLE_PROJECTS = ['super_admin', 'admin', 'hr', 'manager', 'volunteer'] as const

export default defineConfig({
  testDir: './tests/e2e',
  outputDir: 'test-results/pw-artifacts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 4 : undefined,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [
    ['html', { outputFolder: 'test-results/playwright-report', open: 'never' }],
    ['json', { outputFile: 'test-results/playwright-results.json' }],
    ['list'],
  ],
  use: {
    baseURL: BASE,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 15_000,
    navigationTimeout: 45_000,
  },
  projects: [
    // 1. Auth setup — produces one storageState per role.
    { name: 'setup', testMatch: /auth\.setup\.ts/ },

    // 2. Per-role projects, each consuming its storageState.
    ...ROLE_PROJECTS.map((role) => ({
      name: role,
      testMatch: new RegExp(`\\.${role}\\.spec\\.ts$`),
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'], storageState: `${STORAGE_DIR}/${role}.json` },
    })),

    // 3. Cross-role / matrix / API-boundary specs that drive multiple roles
    //    themselves (no single storageState). They build their own contexts.
    {
      name: 'multi',
      testMatch: /\.multi\.spec\.ts$/,
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'] },
    },

    // 4. Birch E2E triage loop — disposable `birch-e2e` tenant. Self-authenticating
    //    (no setup dependency); MUST run against localhost (E2E_BASE override).
    {
      name: 'birch',
      testMatch: /\.birch\.spec\.ts$/,
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
