# Shared Conventions — Parallel Phase Execution Contract

> **READ THIS FIRST, EVERY PHASE.** This is the binding contract that lets 8 phases
> be built **in parallel in separate git worktrees** and merged cleanly afterward.
> Every phase document assumes you have read and will obey this file.
>
> Baseline facts about the codebase live in `../PRODUCT_STATE.md`. The overall plan
> lives in `../IMPLEMENTATION_PLAN.md`. The customer brief is `../birch_foundation.md`.

---

## 1. The golden rule of parallel work: own your files

Merge conflicts happen when two worktrees edit the **same lines of the same file**.
We avoid this by **file ownership**: almost everything a phase builds lives in
**new files inside a phase-owned directory namespace**. You may freely create files
under your namespace. You may **only** touch a "coordination file" (Section 4) through
the exact, append-only protocol defined there.

If you find yourself wanting to edit an existing shared file in a way not described
here — **stop**, write a `MERGE_NOTES.md` entry in your worktree root (Section 7), and
implement the smallest possible append instead.

---

## 2. Worktree workflow (every phase)

```bash
# from the main repo, the orchestrator creates one worktree per phase:
git worktree add ../ess-phase-<N> -b feature/phase-<N>-<slug> feature/multi-tenant-hr-system

# inside the worktree:
pnpm install          # node_modules is per-worktree
cp ../saas-ess/.env.local .env.local   # env is gitignored; copy from main checkout
pnpm dev              # runs on port 3001 — only ONE worktree can use 3001 at a time;
                      # override with: pnpm dev --port 30<N>1  (e.g. phase 3 -> 3031)
```

- **Branch from** `feature/multi-tenant-hr-system` (the current active branch), NOT `main`.
- **Branch name:** `feature/phase-<N>-<slug>` (e.g. `feature/phase-5-lms`).
- Commit early and often with `[phase-<N>]` prefixed messages.
- End commit messages with the standard `Co-Authored-By` trailer used in this repo.
- **Do not rebase onto other phase branches.** Phases integrate only at the final merge.

### Merge order (orchestrator, after all phases done)
Merge in **ascending phase number**: 0 → 1 → 2 → 3 → 4 → 5 → 6 → 7. Phase 0 and Phase 1
establish shared infrastructure the others append to, so they land first and the rest
fast-forward cleanly because they only *append* to coordination files.

---

## 3. Migration number allocation (prevents the #1 conflict)

Existing migrations occupy `001`–`006`. Each phase owns an exclusive block of numbers.
**Never use a number outside your block.** Within your block, number sequentially from
the low end. If you need more than your block, you have over-scoped — raise it in
`MERGE_NOTES.md`.

| Phase | Migration block | Notes |
|---|---|---|
| 0 | `007`–`015` | Baseline core-table schema MUST be `007` (everything else depends on it) |
| 1 | `016`–`019` | Tenant config: terminology, module dependency metadata |
| 2 | `020`–`024` | Profiles, onboarding workflow, RBAC columns |
| 3 | `025`–`029` | Compliance & certification register |
| 4 | `030`–`034` | E-signatures & document completion |
| 5 | `035`–`044` | LMS: content, modules, tracking |
| 6 | `045`–`054` | Quiz engine |
| 7 | `055`–`064` | Reporting, comms, reminders, recert, portal |

**Migration rules**
- Files: `supabase/migrations/<NNN>_<phase>_<description>.sql` (e.g. `035_lms_content.sql`).
- Every new table: `ess_` prefix, `id UUID DEFAULT gen_random_uuid() PRIMARY KEY`,
  `company_id UUID NOT NULL REFERENCES ess_companies(id) ON DELETE CASCADE`,
  `created_at TIMESTAMPTZ DEFAULT NOW()`.
- Every new table MUST ship its RLS policy **in the same migration**, copying the
  `tenant_isolation` pattern from `006_rls_tenant_isolation.sql` (direct-`company_id`
  variant, or parent-scoped variant for child tables). See Section 6.
- Add the matching indexes (`idx_<table>_company`, plus FK columns you filter on).
- Migrations are **append-only and idempotent** (`CREATE TABLE IF NOT EXISTS`,
  `DROP POLICY IF EXISTS` before `CREATE POLICY`). Never edit a lower-numbered migration.

---

## 4. Coordination files — append-only protocol

These few files are unavoidably shared. Touch them **only** as described. Each uses
**phase-delimited regions** so git can auto-merge non-adjacent insertions.

### 4.1 `src/types/roles.ts` — OWNED BY PHASE 1
- **Phase 1** adds **all** new `MODULE_IDS` for the entire project up front (profiles,
  documents_esign, communications, training, quizzes, training_tracking, reporting,
  compliance, expiry_reminders, recertification) and the role-relabel config.
- **All other phases:** do NOT edit `roles.ts`. The module id you need is already there.
  Import `ModuleId` and use the string. If a needed id is missing, it is a Phase 1 bug —
  record it in `MERGE_NOTES.md` and proceed using the agreed string literal from your
  phase doc.

### 4.2 `src/config/navigation.ts` — created by Phase 1, appended by all
Phase 1 creates a registry aggregator with **numbered, phase-delimited slots**:
```ts
// src/config/navigation.ts  (created in Phase 1)
import type { NavSection } from './nav/types'
// === PHASE-2 NAV (insert import above this line) ===
// === PHASE-3 NAV ===
// === PHASE-4 NAV ===
// === PHASE-5 NAV ===
// === PHASE-6 NAV ===
// === PHASE-7 NAV ===
export const navRegistry: NavSection[] = [
  // PHASE-2 ENTRIES
  // PHASE-3 ENTRIES
  // PHASE-4 ENTRIES
  // PHASE-5 ENTRIES
  // PHASE-6 ENTRIES
  // PHASE-7 ENTRIES
]
```
- Each phase creates its own nav file: `src/config/nav/phase-<N>-<slug>.nav.tsx`
  exporting a `NavSection[]` (module id, label key, role gate, items).
- Each phase adds **exactly one import line** under its own `// === PHASE-N NAV ===`
  marker and **one spread** under its own `// PHASE-N ENTRIES` comment. Because every
  phase writes under a **different** marker line, git merges them without conflict.
- The existing `src/components/layout/sidebar.tsx` is refactored **once, by Phase 1**, to
  render from `navRegistry` (filtered by `isModuleEnabled` + `hasMinRole` + label
  resolver). After that, **no phase edits sidebar.tsx.**

### 4.3 `package.json` — append dependencies only
- Add only to `dependencies`/`devDependencies`. Use the **exact pinned versions** listed
  in your phase doc's "Dependencies" section (they were chosen to be mutually compatible).
- Dependency-block merges occasionally conflict on adjacent lines; resolution is trivial
  (keep both). List every dep you added in `MERGE_NOTES.md` so the orchestrator can
  `pnpm install` once after merge.
- Do **not** change `react`, `next`, `@supabase/*`, or `tailwindcss` versions.

### 4.4 `src/app/api/modules/route.ts` & company `settings` shape
- The tenant's enabled modules live in `ess_companies.settings.modules_enabled` (a JSON
  string array). Reading is via `GET /api/modules`. **Do not change** the modules route
  or settings shape except in **Phase 1**, which owns module access + dependency
  enforcement. Other phases only *read* module state via `useModules()`.

### 4.5 Seed scripts
- Do **not** edit `scripts/seed-test-data.ts`. Each phase adds its own additive seed:
  `scripts/seed-phase-<N>.ts` (idempotent upserts, reusing the Acme/Birch tenant ids).

---

## 5. How to build against things another phase owns (stub-and-contract)

Because phases run in parallel, a later phase often needs a table or API a lower phase
"owns" but which doesn't exist in your worktree yet. Rule:

1. **Depend on the documented contract, not the implementation.** Each phase doc has a
   **"Contracts this phase PUBLISHES"** section (stable table names, columns, API shapes,
   TS types). Build against those exact names.
2. **If you need it at runtime in your worktree**, add a **local bootstrap migration in
   your own block** that `CREATE TABLE IF NOT EXISTS` the *minimal* shape of the upstream
   table, so your worktree runs. Mark it clearly:
   ```sql
   -- STUB of Phase 0 ess_audit_log — DELETE BEFORE MERGE (Phase 0 owns the real one)
   ```
   List every stub in `MERGE_NOTES.md`; the orchestrator removes stubs at merge.
3. **Never** publish a competing real definition of another phase's table.

Cross-phase dependency summary (who needs whom — all satisfiable via contracts):
- Phase 0 publishes: baseline core schema, `ess_audit_log`, email service (`sendEmail`),
  cron dispatch (`ess_jobs` + `/api/cron/*`), RLS helpers. **No upstream deps.**
- Phase 1 publishes: terminology resolver (`t()`/`useLabels`), `navRegistry`, module
  dependency map. Depends on: Phase 0 baseline schema (contract only).
- Phases 2–7 depend on Phase 0 (infra) + Phase 1 (labels, nav, modules) **by contract**.
- Phase 6 (quizzes) depends on Phase 5 (module container) by contract.
- Phase 7 reminders/recert depend on Phase 0 email+cron and Phase 3 compliance by contract.

---

## 6. Mandatory code patterns (copy exactly — keeps the codebase uniform)

### 6.1 API route (tenant-safe by default)
Every route handler is wrapped and **must** scope by `companyId`, and for any record
addressed by an id from the URL/body **must** verify ownership (see the IDOR audit —
`docs/security/2026-05-31-tenant-isolation-audit.md`).

```ts
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { withAuth } from '@/lib/auth-middleware'

export const GET = withAuth(async (req: NextRequest, { companyId, employee, role }) => {
  const { data, error } = await supabaseAdmin
    .from('ess_<table>')
    .select('*')
    .eq('company_id', companyId)          // ALWAYS scope to tenant
  if (error) return NextResponse.json({ error: 'Failed' }, { status: 500 })
  return NextResponse.json({ data })
}, { minRole: 'employee' })               // raise minRole as needed: manager|hr|admin

// id-addressed access MUST re-check ownership:
export const PATCH = withAuth(async (req, { companyId }, params) => {
  const { data: row } = await supabaseAdmin.from('ess_<table>')
    .select('id, company_id').eq('id', params!.id).single()
  if (!row || row.company_id !== companyId)
    return NextResponse.json({ error: 'Not found' }, { status: 404 })  // 404, not 403
  // ...proceed
})
```
- Use `withSuperAdmin` (from `src/lib/super-admin-middleware.ts`) for platform routes.
- Cross-tenant access returns **404** (don't reveal existence).

### 6.2 Client service (matches existing `src/services/*`)
```ts
const getToken = () => typeof window !== 'undefined' ? localStorage.getItem('ess_access_token') : null
const authHeaders = (): HeadersInit => {
  const token = getToken()
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }
}
```

### 6.3 RLS for every new table (in the same migration)
Direct `company_id` table:
```sql
alter table public.ess_<table> enable row level security;
alter table public.ess_<table> force row level security;
drop policy if exists tenant_isolation on public.ess_<table>;
create policy tenant_isolation on public.ess_<table>
  for all to authenticated
  using (company_id = public.current_company_id() or public.is_super_admin())
  with check (company_id = public.current_company_id() or public.is_super_admin());
```
Child table (no `company_id`) — scope through the parent, copying the pattern in `006`.

### 6.4 UI
- shadcn/ui components in `src/components/ui/*` (Button, Card, Input, Select, Badge, etc.).
  Reuse them; do not restyle globals.
- Tenant pages live under `src/app/dashboard/<feature>/`; platform pages under
  `src/app/platform/<feature>/`.
- Gate features with `useModules().isModuleEnabled('<module_id>')` and role with
  `hasMinRole(userRole, '<role>')`.
- All user-facing strings go through the Phase 1 label resolver `t('term')` /
  `useLabels()` (Section 4.1 of the Phase 1 doc). Never hard-code "Employee"/"Volunteer".

### 6.5 Types & validation
- Types in `src/types/<feature>.ts`. Zod schemas colocated; validate all request bodies.

---

## 7. Definition of Done (every phase, non-negotiable)

A phase branch is mergeable only when ALL of these hold:
1. `pnpm build` succeeds in the worktree. *(Note: `next.config.ts` currently ignores TS/
   lint errors — Phase 0 turns this off. Until then, still run `pnpm tsc --noEmit` and
   `pnpm lint` and fix everything; do not rely on the ignore flags.)*
2. `pnpm test` passes, including the new tests this phase adds.
3. Every new table has an RLS policy and a cross-tenant denial test
   (tenant-B token → 404/403 on a tenant-A record).
4. Every new API route uses `withAuth`/`withSuperAdmin`, scopes by `companyId`, and
   id-addressed routes re-check ownership.
5. New UI is module-gated, role-gated, and uses the label resolver (no hard-coded terms).
6. A `scripts/seed-phase-<N>.ts` seeds demo data for the phase (idempotent).
7. `MERGE_NOTES.md` (worktree root) lists: migrations added, coordination-file
   appends made, deps added, any STUBs to delete, and any cross-phase assumptions.
8. The phase doc's **Acceptance Criteria** all demonstrably pass (manually verified;
   capture a screenshot or test output).

---

## 8. Tenant / test data conventions
- Birch Foundation is the primary tenant. Reuse a stable slug `birch-foundation`.
- Demo users keep password `Test1234!`. Roles use the underlying values
  (`admin`/`hr`/`manager`/`employee` + `is_super_admin`) — the **display labels**
  (Admin/Staff/Volunteer/Super Admin) come from the Phase 1 resolver.
- Never hard-code a tenant UUID in app code; always derive `companyId` from `AuthContext`.

---

## 9. Quick reference — repo facts
- Stack: Next.js 15.5 App Router, React 18, TS, Supabase (Postgres+Auth+Storage), shadcn/ui, Tailwind v4, Zustand, React Query, Zod, Recharts.
- Auth: Supabase Auth; Bearer token in `localStorage` key `ess_access_token`; server verifies via service-role.
- DB access in routes: `supabaseAdmin` (service role, **bypasses RLS** — so app-layer `companyId` checks are mandatory).
- Dev: `pnpm dev` (port 3001). Build: `pnpm build`. Test: `pnpm test` (Jest).
- Storage: Supabase Storage buckets; private by default, access via signed URLs (see Phase 4).
- Deploy target: Vercel project `saas-ess` (https://saas-ess.vercel.app).

### Confirmed client decisions (binding for all phases)
- **Role display mapping:** admin→Admin, hr→Staff, manager→Staff, employee→Volunteer,
  super_admin→Super Admin. Underlying role values DO NOT change (display labels only via
  Phase 1 resolver). Permission checks may still distinguish hr/manager internally.
- **Email provider = MailRelay** (`https://email.relevel.ai/api/emails`, Resend-compatible
  REST, Bearer `sk_live_...`). Call via `fetch` — **do not add the `resend` package**. All
  email goes through Phase 0's published `sendEmail()` from `@/lib/email/send`. Env:
  `MAILRELAY_API_KEY`, `MAILRELAY_API_URL`, `EMAIL_FROM_DEFAULT`, `EMAIL_FROM_NAME_DEFAULT`.
- **Scheduled jobs = Vercel Cron** → `/api/cron/run-jobs` every 5 min (Phase 0).
- **Quiz scope = FULL** — all 5 question types incl. essay/long-form + manual-grade queue
  (Phase 6).
