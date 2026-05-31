# Phase 0 — Foundation Hardening & Shared Infrastructure

> **Self-contained build doc.** Read `_SHARED_CONVENTIONS.md` first. This phase has **no
> upstream dependencies** and is the foundation every other phase builds on. It merges
> **first**. Migration block: **`007`–`015`**.
> Brief modules: 0.1 (isolation/scale), 0.5 (audit log), cross-cutting infra.

---

## 1. Mission
Make the platform safe and operable for a compliance product before any feature work:
1. Fix the **6 known cross-tenant IDOR bugs** (live, exploitable).
2. Make the database **reproducible** (capture the un-migrated core schema).
3. Verify & complete **RLS**.
4. Stand up **email** + **scheduled jobs** + **audit log** infrastructure used by Phases 3, 7.
5. Turn on real CI safety (stop ignoring TS/lint errors).

This phase is **security- and infra-only** — no new end-user features.

## 2. Why it's first
Phases 7 (reminders/recert), 3 (compliance audit), and 4 (signature audit) cannot work
without email, cron, and audit infrastructure. And shipping ANY new feature on top of the
known IDOR bugs would widen the breach surface. Everything waits on this.

---

## 3. Owned files / namespace
You may create/modify freely:
- `supabase/migrations/007_*.sql` … `015_*.sql`
- `src/lib/email/**` (new) — email service
- `src/lib/jobs/**` (new) — job runner/dispatch
- `src/lib/audit.ts` (new) — audit log helper
- `src/app/api/cron/**` (new) — cron entrypoints
- `src/app/api/**` — **IDOR fixes** to the 6 named routes (you own these edits this phase)
- `next.config.ts` — flip the ignore flags (coordination: you are the only phase editing it)
- `vercel.json` (new) — cron schedule registration
- `scripts/seed-phase-0.ts`

## 4. Migrations (block 007–015)
- **`007_baseline_core_schema.sql` (CRITICAL, do first).** Reverse-engineer the
  un-migrated core tables so the DB is reproducible from source. At minimum:
  `ess_companies`, `ess_app_users`, `ess_employees`, `ess_leave_types`,
  `ess_leave_applications`, `ess_leave_application_days`, `ess_leave_allocations`,
  `ess_leave_approval_entries`, `ess_expense_categories`, `ess_expense_claims`,
  `ess_expense_claim_items`, `ess_expense_approval_entries`, `ess_approval_rules`.
  Use `CREATE TABLE IF NOT EXISTS` (these already exist in the live DB — migration must be
  a no-op there but build a fresh DB correctly). Derive exact columns from the code that
  queries them (grep `from('ess_companies')` etc.) and from the live schema (request DB
  introspection access — see risk in IMPLEMENTATION_PLAN). Include FKs, checks, indexes.
  **Note:** `006_rls_tenant_isolation.sql` ALTERs several of these tables, so `007` must be
  ordered to allow `006`→`007` re-run on a fresh DB; if `006` would fail on a fresh DB
  because tables don't exist, add a `006a`/`008` that re-applies the `006` policies AFTER
  `007` creates the tables (document the chosen approach in `MERGE_NOTES.md`).
- **`008_audit_log.sql`** — `ess_audit_log` (see contract §6).
- **`009_jobs.sql`** — `ess_jobs` dispatch/log table (see contract §6).
- **`010_rls_completion.sql`** — complete/verify `tenant_isolation` on every existing
  table not already covered; add a `force row level security` audit. (Real RLS verification
  is a test, §7.)
- `011`–`015` reserved (use if baseline splits across files).

## 5. Work items

### 5.1 Fix the 6 IDOR bugs (CRITICAL — do before anything else ships)
Per `docs/security/2026-05-31-tenant-isolation-audit.md`. Apply the §6.1 ownership-check
pattern from conventions. Add `.eq('company_id', companyId)` and/or parent-ownership checks:
1. **CRITICAL** `src/app/api/timesheets/[id]/entries/route.ts` — verify the timesheet
   belongs to `companyId` AND (`employee_id === ctx.employee.id` or approver) before the
   delete+insert.
2. **CRITICAL** `src/app/api/employee/[id]/route.ts` — add `.eq('company_id', companyId)`.
3. **HIGH** `src/app/api/leave-applications/[id]/route.ts` — scope by `companyId`; keep
   approver branch as an *additional in-company* constraint.
4. **HIGH** `src/app/api/goals/route.ts` — resolve target employee, verify same company
   (+ manager/HR rights to view others) before returning.
5. **MEDIUM** `src/app/api/documents/[id]/acknowledge/route.ts` — verify document
   `company_id === companyId` before insert.
6. **MEDIUM** `src/app/api/approval-chain/[id]/route.ts` — verify target employee in
   `companyId` before walking `reports_to`.
Also add an explicit company assertion to `process-approval` (defense-in-depth).

### 5.2 Email infrastructure → publishes `sendEmail`
- **Provider: MailRelay** (self-hosted at `https://email.relevel.ai`). It is a
  Resend-compatible HTTP API — **do NOT add the `resend` npm package**; call the REST
  endpoint directly with `fetch`.
- Env vars: `MAILRELAY_API_KEY` (Bearer `sk_live_...`), `MAILRELAY_API_URL`
  (default `https://email.relevel.ai/api/emails`), `EMAIL_FROM_DEFAULT`
  (e.g. `noreply@mail.relevel.ai`), `EMAIL_FROM_NAME_DEFAULT`. Document in `MERGE_NOTES.md`
  + `ENV_SETUP.md`.
- API contract (verified):
  ```
  POST https://email.relevel.ai/api/emails
  Authorization: Bearer sk_live_...
  Content-Type: application/json
  body: { from, from_name?, to: string[], subject, html, text?, reply_to?, cc?, bcc?,
          attachments?: [{filename, content (base64), content_type}], metadata? }
  → 202 { data: { id, status, ses_message_id } }   // also: 403 domain unverified,
                                                    // 413 attachments >40MB, 422 suppressed
  ```
- `src/lib/email/send.ts` exports:
  ```ts
  export async function sendEmail(opts: {
    to: string | string[]; subject: string; html: string; text?: string;
    companyId: string;             // for branding + audit
    replyTo?: string; cc?: string[]; bcc?: string[];
    attachments?: { filename: string; content: string; content_type: string }[];
  }): Promise<{ id: string; status: string }>
  ```
  Implementation: normalize `to` to an array, resolve per-tenant from-name/branding from
  `ess_companies`, POST to MailRelay, handle non-202 statuses (surface 403/413/422 clearly),
  return `data.id`/`data.status`.
- Per-tenant from-identity & branding: pull company name/logo/color from `ess_companies`.
- Log every send to `ess_audit_log` (action `email.sent`, meta includes `id`/`status`).
- Provide a dev/no-op transport when `MAILRELAY_API_KEY` is absent (logs to console, returns
  a fake id) so other worktrees run without the key.

### 5.3 Scheduled jobs → publishes job runner + cron
- `ess_jobs` table (contract §6). A job has type, payload (jsonb), `run_after`, status,
  attempts, last_error, company_id (nullable for platform jobs).
- `src/lib/jobs/dispatch.ts`: `enqueueJob(type, payload, runAfter?)`, `claimDueJobs(limit)`,
  `markJobDone/Failed`. Idempotent, at-least-once.
- `src/app/api/cron/run-jobs/route.ts` — protected by a `CRON_SECRET` header check;
  claims due jobs and dispatches to registered handlers. Handlers are registered by other
  phases via a registry file `src/lib/jobs/handlers.ts` using the **phase-delimited marker**
  pattern (mirror navigation.ts; pre-seed `// === PHASE-7 HANDLERS ===` markers).
- `vercel.json` registers the cron: `{ "crons": [{ "path": "/api/cron/run-jobs", "schedule": "*/5 * * * *" }] }`.

### 5.4 Audit log → publishes `recordAudit`
- `src/lib/audit.ts`: `recordAudit({ companyId, actorId, action, target, meta })`.
- Wire it into platform-admin actions (tenant create/suspend, impersonation) and email sends.

### 5.5 CI safety
- `next.config.ts`: set `eslint.ignoreDuringBuilds: false` and
  `typescript.ignoreBuildErrors: false`. Fix all resulting errors in YOUR worktree only.
  *(Other phases were told in conventions to keep their tree clean regardless.)*

### 5.6 Scale check (brief 0.1)
- Add indexes for hot paths surfaced during IDOR review. Document a basic load assumption
  (250 concurrent users/tenant) and confirm connection pooling settings; note findings.

## 6. Contracts this phase PUBLISHES (downstream phases depend on these names)
- **`ess_audit_log`**: `id uuid pk, company_id uuid null, actor_app_user_id uuid null,
  action text not null, target_type text, target_id text, meta jsonb, created_at timestamptz`.
- **`ess_jobs`**: `id uuid pk, company_id uuid null, type text not null, payload jsonb,
  status text check in ('pending','running','done','failed') default 'pending',
  run_after timestamptz default now(), attempts int default 0, last_error text,
  created_at timestamptz, updated_at timestamptz`.
- **`sendEmail(opts)`** from `@/lib/email/send`.
- **`enqueueJob(type, payload, runAfter?)`** from `@/lib/jobs/dispatch`; handler registry
  at `@/lib/jobs/handlers` with `// === PHASE-N HANDLERS ===` markers for 3 & 7.
- **`recordAudit(...)`** from `@/lib/audit`.
- **Baseline core schema** (table/column names) now in `007`.
- RLS helpers `current_company_id()`, `is_super_admin()` (from `006`, verified here).

## 7. Tests
- **RLS denial test** (`src/__tests__/integration/rls-isolation.test.ts`): with a tenant-B
  user's JWT (anon/authenticated client, NOT service role), selecting a tenant-A row returns
  empty; insert/update with tenant-A `company_id` is rejected.
- **IDOR regression tests**: one per fixed route — tenant-B token → 404 on tenant-A id;
  the timesheet-entries test asserts no mutation occurred.
- **Email**: `sendEmail` no-op transport returns an id and writes an audit row.
- **Jobs**: enqueue → `claimDueJobs` returns it once → mark done → not re-claimed.

## 8. Seed (`scripts/seed-phase-0.ts`)
- Ensure Birch Foundation tenant + a super-admin user exist (no super-admin seed exists
  today — create one: `superadmin@birch.org` / `Test1234!`, `is_super_admin=true`).
- Seed a tenant-B (`acme`) so isolation tests have two tenants.

## 9. Acceptance criteria
- [ ] Fresh Supabase project can be built from `supabase/migrations/*` end to end.
- [ ] All 6 IDOR routes return 404 to a cross-tenant token; regression tests prove it.
- [ ] RLS denial test passes for non-service-role clients.
- [ ] A test email "sends" (no-op in dev) and writes an audit row.
- [ ] A cron hit to `/api/cron/run-jobs` claims and completes a queued job.
- [ ] Platform-admin actions write to `ess_audit_log`.
- [ ] `pnpm build` passes with ignore-flags OFF.

## 10. MERGE_NOTES to record
Migrations 007–0xx; new env vars (`MAILRELAY_API_KEY`, `MAILRELAY_API_URL`,
`EMAIL_FROM_DEFAULT`, `EMAIL_FROM_NAME_DEFAULT`, `CRON_SECRET`); `next.config.ts` flag flip;
`vercel.json` added; handler-registry markers added; any decision about the 006/007 ordering.
