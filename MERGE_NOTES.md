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
