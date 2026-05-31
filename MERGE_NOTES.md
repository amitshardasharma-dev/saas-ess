# MERGE_NOTES — Phase 0 (Foundation Hardening & Shared Infrastructure)

Branch: `feature/phase-0-foundation`. Merge **first** (ascending phase order).

## Migrations added (block 007–015 → used 007–010)
- `supabase/migrations/007_baseline_core_schema.sql` — reverse-engineered baseline
  of the un-migrated core tables (`ess_app_users`, `ess_leave_balances`,
  `ess_approval_rules`) via `CREATE TABLE IF NOT EXISTS`, plus
  `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` for hand-added columns on the
  001–005 tables, all FK/lookup indexes (§5.6), and RLS on the 3 tables it
  creates.
- `supabase/migrations/008_audit_log.sql` — `ess_audit_log` + indexes + RLS.
- `supabase/migrations/009_jobs.sql` — `ess_jobs` + indexes + RLS.
- `supabase/migrations/010_rls_completion.sql` — idempotently (re)asserts RLS +
  `tenant_isolation` policies on every core table (the 006/007 convergence
  point, see below).

> Note on column accuracy: the live Supabase DB is in an org the MCP token cannot
> read (PRODUCT_STATE §3), so columns in 007 were derived from the querying code,
> not live introspection. Treat 007 as a best-effort reproducible baseline; a
> human with DB access should diff it against the live schema before relying on a
> from-scratch rebuild. It is written to be a **no-op on the live DB** (all
> IF NOT EXISTS).

### 006/007 ordering decision
Migration `006_rls_tenant_isolation.sql` (already merged, must not be edited)
ALTERs/enables RLS on tables that were never created by a migration. On a fresh
`supabase db reset`, `006` runs before `007` and would fail because those tables
do not yet exist.

**Chosen approach (option b from the phase doc):** do not touch 006. `007`
creates the missing tables; `010_rls_completion.sql` then re-creates **every**
core tenant-isolation policy with `DROP POLICY IF EXISTS` + `CREATE POLICY`, so
the end state is correct regardless of whether 006 succeeded, partially
succeeded, or was skipped. Recommended fresh-DB path: allow 006 to fail/skip; 010
establishes the complete, correct policy set. On the live DB, 006 already
applied, so 007–010 are effectively no-ops/idempotent re-asserts.

> The RLS policies in 007/008/009/010 use the inline JWT-claim form
> (`current_setting('request.jwt.claims', ...)`) rather than the `006` helpers
> `current_company_id()` / `is_super_admin()`, to remain self-contained and not
> assume 006 ran. If the orchestrator prefers, these can be switched to the
> helper functions at merge once 006 is confirmed present. App traffic uses the
> service-role client (BYPASSRLS), so the real tenant control is the app-layer
> `company_id` checks in the IDOR fixes below — RLS is defense-in-depth.

## IDOR fixes (§5.1) — the 6 named routes (cross-tenant → 404)
1. `src/app/api/timesheets/[id]/entries/route.ts` — now verifies the timesheet
   belongs to `companyId` AND caller is owner or approver before exposing entries.
2. `src/app/api/employee/[id]/route.ts` — wrapped in `withAuth`; lookup scoped to
   `company_id` (previously unauthenticated + unscoped — PII leak).
3. `src/app/api/leave-applications/[id]/route.ts` — wrapped in `withAuth`; lookup
   scoped to `company_id`.
4. `src/app/api/goals/route.ts` — `employee_id` query param now requires the
   target employee be in the same company AND caller be `manager+`; else 404.
5. `src/app/api/documents/[id]/acknowledge/route.ts` — verifies the document
   `company_id` before writing an acknowledgment.
6. `src/app/api/approval-chain/[id]/route.ts` — wrapped in `withAuth`; both the
   expense-claim and leave-application parent lookups scoped to `company_id`.
- Defense-in-depth: `src/app/api/process-approval/route.ts` now resolves the
  caller's `company_id` and adds an explicit `.eq('company_id', companyId)` to the
  expense/timesheet/leave parent lookups.

## New infrastructure (contracts this phase PUBLISHES)
- `src/lib/email/send.ts` → `sendEmail(opts)` (MailRelay via `fetch`, no `resend`
  package; no-op console transport when `MAILRELAY_API_KEY` absent; logs every
  send to `ess_audit_log`).
- `src/lib/jobs/dispatch.ts` → `enqueueJob` / `claimDueJobs` / `markJobDone` /
  `markJobFailed` (at-least-once; conditional-update lock; exp. backoff).
- `src/lib/jobs/handlers.ts` → `jobHandlers` registry + `getJobHandler`, with the
  `// === PHASE-3 HANDLERS ===` and `// === PHASE-7 HANDLERS ===` markers
  pre-seeded (append-only, mirrors navigation.ts).
- `src/app/api/cron/run-jobs/route.ts` → cron entrypoint guarded by `CRON_SECRET`
  (accepts `Authorization: Bearer <secret>` or `x-cron-secret`).
- `src/lib/audit.ts` → `recordAudit(...)` (best-effort; never throws). Wired into
  platform tenant create / update / suspend / impersonate and into email sends.
- `vercel.json` → cron `/api/cron/run-jobs` every 5 minutes.
- `scripts/seed-phase-0.ts` → idempotent; ensures Birch Foundation tenant,
  tenant-B `acme`, and super-admin `superadmin@birch.org` / `Test1234!`
  (`is_super_admin = true`).

## Coordination-file edits
- `next.config.ts` — flipped `eslint.ignoreDuringBuilds` and
  `typescript.ignoreBuildErrors` to **false** (§5.5). Phase 0 is the only phase
  that edits this file.
- `src/app/api/platform/tenants/route.ts`, `.../tenants/[id]/route.ts`,
  `.../tenants/[id]/impersonate/route.ts` — added `recordAudit` calls (audit
  wiring; no behavior change beyond logging).
- `src/app/api/process-approval/route.ts` — added company assertion (see above).

## New env vars (orchestrator must set in Vercel + .env.local)
- `MAILRELAY_API_KEY` — Bearer `sk_live_...` for MailRelay. If absent, email runs
  in no-op console mode.
- `MAILRELAY_API_URL` — defaults to `https://email.relevel.ai/api/emails`.
- `EMAIL_FROM_DEFAULT` — e.g. `noreply@mail.relevel.ai`.
- `EMAIL_FROM_NAME_DEFAULT` — default sender display name (per-tenant override
  pulled from `ess_companies.name`).
- `CRON_SECRET` — shared secret guarding `/api/cron/run-jobs`.

> `.env.example` does not exist in this repo; env documentation lives in
> `ENV_SETUP.md` (left untouched here to avoid a blind merge edit). Add the five
> vars above to `ENV_SETUP.md` and Vercel at merge time.

## Dependencies added
- None. (Email uses native `fetch`; tests use the already-present
  jest/ts-jest/next-jest toolchain.)

## Tests added (Jest, existing `jest.config.ts` / next-jest / jsdom)
- `src/__tests__/integration/idor-regression.test.ts` — one case per fixed route;
  tenant-B token → 404 on tenant-A id, asserting the `company_id` scope filter.
- `src/__tests__/lib/audit.test.ts`, `.../lib/email.test.ts`, `.../lib/jobs.test.ts`.

## STUBs to delete before merge
- None.

## Cross-phase assumptions
- `ess_audit_log` column names match the published contract
  (`actor_app_user_id`, `target_type`, `target_id`, `meta`). Downstream phases
  should use `recordAudit()` rather than insert directly.
- `ess_jobs` uses `run_after` (per the published contract), not `run_at`.

## Verification status (at hand-off)
- `npx tsc --noEmit` → **0 errors** (clean).
- `pnpm test` (jest) → **8 suites / 51 tests pass**.
- `pnpm lint` (next lint) → **No ESLint warnings or errors**.

## Pre-existing errors fixed (surfaced by turning ignore flags off)
Turning off `typescript.ignoreBuildErrors` surfaced two genuine, pre-existing
bugs in test files (NOT caused by Phase 0). Both fixed minimally:
- `src/__tests__/services/timesheet.test.ts` — used `entry_mode`; the
  `TimesheetConfig` field is `mode`. Renamed.
- `src/__tests__/integration/api-test-runner.ts` — a local `async function test`
  collided with the ambient jest `test` global (TS2300). Renamed the local
  helper (and its 57 call sites) to `testCase`. This file is a standalone live
  HTTP runner (`npx tsx`), not a jest spec; behavior is unchanged.

## Known issues / follow-ups
- None blocking. The 007 baseline schema should be diffed against the live DB by
  someone with introspection access before relying on a from-scratch rebuild
  (see the note under "Migrations added").
# MERGE_NOTES — Phase 1 (Tenant Configuration)

Branch: `feature/phase-1-tenant-config`. Merges **second** (right after Phase 0).
Phase 1 owns the coordination files; later phases only **append** to them.

## 1. Coordination files established (all phases depend on these)

### `src/types/roles.ts` — final MODULE_IDS (DO NOT re-edit in later phases)
```
leave, expense, timesheets, documents, appraisals, contracts, team_calendar,   // existing
profiles, documents_esign, communications, training, quizzes, training_tracking,
reporting, compliance, expiry_reminders, recertification                       // Phase 2-7
```
- `team_calendar` was already present pre-Phase-1 and is **preserved**.
- Added `MODULE_DEPENDENCIES` (code constant, the source of truth):
  `recertification → [training, compliance]`, `quizzes → [training]`,
  `training_tracking → [training]`, `expiry_reminders → [compliance]`.
- Added `ROLE_DISPLAY` + `roleDisplayLabel()`. **CONFIRMED role display mapping:**
  `admin→Admin`, `hr→Staff`, `manager→Staff`, `employee→Volunteer`,
  `super_admin→Super Admin`. Underlying role VALUES unchanged; `super_admin` is the
  `is_super_admin` flag, keyed separately (not a `UserRole`).

### `src/config/navigation.ts` — created with all phase markers
- Import markers: `// === PHASE-2 NAV ===` … `// === PHASE-7 NAV ===`
  (PHASE-2 line reads `// === PHASE-2 NAV (insert import above this line) ===`).
- Entry markers in `navRegistry`: `// PHASE-2 ENTRIES` … `// PHASE-7 ENTRIES`.
- Each later phase: create `src/config/nav/phase-<N>-<slug>.nav.tsx` exporting
  `NavSection[]`; add ONE import under its `// === PHASE-N NAV ===` marker and ONE
  spread under its `// PHASE-N ENTRIES` comment. Different marker per phase → no conflict.
- `src/config/nav/types.ts` — `NavItem` / `NavSection` / `NavVisibilityExtras`.
- `src/config/nav/core.nav.tsx` — pre-Phase-1 nav migrated verbatim (parity).
- `src/config/nav/filter.ts` — pure visibility predicates (module + role + custom).
- `src/components/layout/sidebar.tsx` — **refactored ONCE** to render from `navRegistry`.
  Look/behavior preserved (collapse, expand, sub-items, icons, descriptions,
  active highlight, leave-approval gating, footer/logout/platform link).
  **No later phase edits sidebar.tsx.**

### `src/app/api/modules/route.ts` — module access (Phase 1 owns changes here)
- `GET` unchanged shape (`{ modules_enabled }`). Added `PUT` (admin) for single
  toggles with dependency enforcement (409 on illegal toggle).
- Module state still lives in `ess_companies.settings.modules_enabled` (JSON array) —
  shape unchanged.

## 2. Published contracts (consume by import; do not re-implement)
- `@/lib/modules`: `assertModuleEnabled(companyId, moduleId)` (throws
  `ModuleDisabledError`), `getEnabledModules`, and re-exports of the pure graph
  helpers. The pure dependency-graph logic (`assertToggleAllowed`,
  `validateModuleSet`, `missingDependenciesForEnable`, `dependentsBlockingDisable`,
  `ModuleDependencyError`) lives in `@/lib/modules-deps` (NO Supabase import) so it
  is client- and test-safe; `@/lib/modules` re-exports it. Runtime callers can use
  either path.
- `@/lib/labels` (server): `getLabels(companyId)`, `getLabelFn(companyId)`.
  Pure helpers in `@/lib/labels/resolve` (`resolveLabels`, `makeLabelFn`) and
  defaults/keys in `@/lib/labels/defaults` (`TERM_KEYS`, `DEFAULT_LABELS`, `isTermKey`).
- `@/hooks/use-labels` (client): `useLabels()` → `{ labels, loading, t(key,{plural}) }`
  (fetch-once + module-level cache, like `useModules`). Backed by `GET /api/labels`.
- Term keys: `person`, `supervisor`, `org_unit`, `certification`,
  `training_module`, `document`.
- `ess_tenant_labels` table (see below).

## 3. Migrations added (block 016–019)
- **`016_tenant_terminology.sql`** — creates `ess_tenant_labels`:
  `(id uuid pk, company_id uuid fk→ess_companies on delete cascade, term_key text,
   singular text, plural text, created_at, updated_at, UNIQUE(company_id, term_key))`
  + index `idx_ess_tenant_labels_company`. Ships RLS (`tenant_isolation`,
  `current_company_id() OR is_super_admin()`).
- **`017_module_config.sql`** — intentional no-op (`SELECT 1;`). Documents the
  decision that module dependencies are a CODE constant (`MODULE_DEPENDENCIES`),
  not a table. Reserves the number.
- `018`, `019` — reserved (not used).

## 4. RLS / cross-phase dependency
- `016`'s RLS uses `public.current_company_id()` and `public.is_super_admin()`.
  These helpers are **Phase 0's** (`006_rls_tenant_isolation.sql`), which is NOT in
  this worktree. This is a by-contract dependency per _SHARED_CONVENTIONS §6.3 — it
  resolves once Phase 0 merges first (the documented merge order). No stub needed:
  app routes use `supabaseAdmin` (service role) and scope by `companyId` in code.

## 5. STUBS to delete before merge
- **`src/lib/audit.ts`** — `-- DELETE BEFORE MERGE`. Minimal best-effort
  `recordAudit()` writing to `ess_audit_log` (Phase 0 owns the real helper + table).
  Never throws; safe no-op if the table is absent. After Phase 0 merges, delete this
  file and re-point the two importers below to Phase 0's `recordAudit`:
  - `src/app/api/platform/tenants/[id]/route.ts` (records `modules.updated`)
  - `src/app/api/platform/tenants/[id]/labels/route.ts` (records `terminology.updated`)

## 6. Other files added/changed (within Phase 1 namespace)
- API: `src/app/api/labels/route.ts` (GET resolved labels for current company);
  `src/app/api/platform/tenants/[id]/labels/route.ts` (super-admin GET/PUT overrides).
- Platform UI: `src/components/platform/terminology-panel.tsx` mounted in
  `src/app/platform/tenants/[id]/page.tsx`; that page's Modules card now uses the
  full `MODULE_IDS` list + a client-side dependency cascade (`applyModuleToggle`).
- `src/app/api/platform/tenants/[id]/route.ts` PUT now validates `modules_enabled`
  against the dependency graph (`validateModuleSet`) → 409 on inconsistency.
- `src/services/platform.ts` — added `getTenantLabels` / `updateTenantLabel` +
  `TenantLabelOverride` type.
- `src/components/settings/settings-form.tsx` — tenant admin module list made
  resilient to the expanded `MODULE_IDS` (partial label map + humanized fallback).
- Seed: `scripts/seed-phase-1.ts` (Birch labels + modules; idempotent; slug
  `birch-foundation`). **Not run live.**
- Tests: `src/__tests__/lib/modules.test.ts`, `src/__tests__/lib/labels.test.ts`,
  `src/__tests__/config/navigation.test.ts`, `src/__tests__/types/role-display.test.ts`.

## 7. Dependencies added to package.json
- **None.** (No new runtime/dev deps.)

## 8. Build / test status
- `tsc --noEmit`: clean for all Phase-1 code. Two PRE-EXISTING errors remain on the
  base branch and are unrelated to Phase 1:
  `src/__tests__/integration/api-test-runner.ts` (TS2300 duplicate `test`),
  `src/__tests__/services/timesheet.test.ts` (TS2353 `entry_mode`).
- `eslint` on all Phase-1 files: clean (0 issues). `next lint` exits 0 (warnings only;
  any stale-cache line numbers do not reflect current files).
- `jest`: 8/9 suites pass (71 passing). The one failing suite,
  `api-test-runner.ts`, fails identically on the base branch (pre-existing).
  Phase 1's 4 new suites: 40 tests, all passing.

## 9. Acceptance criteria
- [x] Enabling a module with unmet deps is blocked with a clear message (PUT 409;
      `assertToggleAllowed`; unit-tested).
- [x] Disabling a module blocked while a dependent is on (unit-tested).
- [x] Disabled modules: nav hidden (registry filter) + `assertModuleEnabled` 403 guard.
- [x] Sidebar renders identically to before for existing modules, now via registry
      (parity test + verbatim core.nav migration).
- [x] Terminology resolver: unknown tenant → defaults; override applies; plural works.
- [x] Platform admin can edit per-tenant terminology (Terminology panel) and modules.

# MERGE_NOTES — Phase 2 (Profiles, Onboarding Workflow & RBAC Relabel)

Branch: `feature/phase-2-profiles-onboarding-rbac`. Merges third (after 0, 1).

## Migrations added (block 020–024 → used 020 only)
- `supabase/migrations/020_onboarding.sql` — creates `ess_onboarding_templates`,
  `ess_onboarding_steps`, `ess_onboarding_states`. Each: `id uuid pk default
  gen_random_uuid()`, `company_id uuid not null references ess_companies(id)`,
  `created_at`, `updated_at`. `ess_onboarding_states` has `unique (company_id,
  employee_id)`. RLS + `tenant_isolation` policy
  (`company_id = current_company_id()`) shipped in the SAME migration for all
  three tables. Indexes on employee_id / template_id.
  - NOTE: uses the simpler `using/with check (company_id = current_company_id())`
    form. The base `006` direct-`company_id` pattern additionally has
    `force row level security`, `to authenticated`, and `or is_super_admin()`.
    Functionally compatible (app routes use service-role and scope by companyId in
    code); orchestrator may align 020 to the full 006 form before live apply.
- 021–024 reserved / unused.

## Published contracts (other phases depend on EXACT names) — `src/lib/onboarding.ts`
- `type OnboardingStatus = 'not_started' | 'in_progress' | 'blocked' | 'completed'`
- `type OnboardingStepStatus = 'pending' | 'done' | 'skipped'`
- `async advanceOnboarding(employeeId: string): Promise<OnboardingStatus>`
- `async initOnboarding(employeeId: string, companyId: string): Promise<void>`
- `computeOnboardingStatus(steps, isBlocked?)` — pure helper (tested).
- interfaces `OnboardingState`, `OnboardingStep`.
- API: `GET /api/onboarding?employee_id=<uuid>` → `{ state, steps }` (defaults to
  caller's own employee); `PATCH /api/onboarding/steps/[id]` → `{ step }` (body
  `{ status }`; cross-tenant 404 ownership re-check; recomputes parent state via
  `advanceOnboarding`); `GET /api/people` → `{ people }` (minRole `manager`).
- Phases 3/4/5 may call `advanceOnboarding` after their events (cert added, doc
  signed, training done).

## Files created (Phase 2 namespace)
- `src/lib/onboarding.ts` (state machine + contracts; uses `supabaseAdmin`)
- `src/app/api/onboarding/route.ts`, `src/app/api/onboarding/steps/[id]/route.ts`
- `src/app/api/people/route.ts`
- `src/components/onboarding/onboarding-checklist.tsx` (profile checklist, client)
- `src/app/dashboard/onboarding/page.tsx` ("My Onboarding")
- `src/app/dashboard/people/page.tsx` (client; fetches `/api/people`),
  `people-data.ts` (server loader), `people-table.tsx` (search/filter by role,
  org unit, onboarding status)
- `src/config/nav/phase-2-onboarding.nav.tsx`
- `scripts/seed-phase-2.ts` (idempotent; NOT run)
- Tests: `src/__tests__/onboarding-state-machine.test.ts`, `phase-2-rls.test.ts`,
  `role-relabel.test.ts`

## Coordination-file edits (append-only protocol)
- `src/config/navigation.ts` — ONE import above `// === PHASE-2 NAV ===` and ONE
  spread under `// PHASE-2 ENTRIES`. Nothing else touched.

## RBAC relabel
- Display-only via existing `roleDisplayLabel()` (admin→Admin, hr→Staff,
  manager→Staff, employee→Volunteer, super_admin→Super Admin). No new role
  values, no permission changes. People table + role filter use `USER_ROLES` +
  `roleDisplayLabel()`.

## Cross-phase defensive consumption (people dashboard)
- Module state read once via `getEnabledModules(companyId)` (Phase 1 contract).
- Phase 4 signed docs: queries `ess_signed_documents` when `documents_esign` (or
  `documents`) enabled, inside try/catch; `—` when unavailable.
- Phase 3 certs: queries `ess_certifications` when `compliance` enabled, inside
  try/catch; `—` when the table is absent (it does NOT exist in this base).
- Neither table is created by this phase. Role read from `ess_app_users` (joined
  via `ess_employees.app_user_id`); org unit falls back `org_unit` → `department`.

## Dependencies added
- None.

## STUBs to delete before merge
- None.

## Verification status (at hand-off)
- `npx tsc --noEmit --pretty false`: **0 errors** — confirmed (ran cleanly 3x on
  the final tree, after the contract-mismatch fixes).
- `npx jest`: a reliable summary could NOT be captured in this session — the
  harness intermittently returned exit 194 with no output (environment/sandbox
  flake on the symlinked `node_modules` + stdout capture), alternating with real
  runs. The 3 new suites are PURE logic / file-parse only (no `fetch`, no Supabase
  import at module load) so they have no runtime dependency that could fail, but
  jest-green is NOT independently re-confirmed here. Orchestrator: run `npx jest`
  once in a stable shell; expect base 246 + 3 new Phase-2 suites green.

## Contract mismatches found by reading real foundation files, then FIXED (commit 2)
A first pass guessed wrong APIs; reading the actual base files corrected them:
1. `createRouteClient` / `ctx.employeeId` / `ctx.userId` do NOT exist. Real:
   `withAuth(handler, { minRole })` → `AuthContext { authUser, appUser, employee,
   companyId, role }`; DB access via `supabaseAdmin` from `@/lib/supabase-server`.
2. `AppRole` / `ALL_ROLES` → use `UserRole` / `USER_ROLES`.
3. `isModuleEnabled` free function → use `getEnabledModules` (or `assertModuleEnabled`).
4. Role lives on `ess_app_users`, not `ess_employees`; org column is `department`
   in base employees (added `org_unit` fallback).
5. People page can't be a server component using a route client → client page +
   new `GET /api/people` route.

## OPEN ITEMS for orchestrator
1. `initOnboarding` is NOT yet wired into a real user-create route. The intended
   `src/app/api/tenants/route.ts` does NOT exist in the base; the real super-admin
   user-create flow is `src/app/api/platform/tenants/[id]/users/route.ts`. Call
   `initOnboarding(newEmployee.id, companyId)` there after a user/employee is
   created. The published `initOnboarding` contract exists and is callable.
2. Run `npx jest` in a stable shell to confirm green (see Verification status).
3. Optionally align 020 RLS to the full 006 form.
