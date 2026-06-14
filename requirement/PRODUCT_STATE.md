# Product State — As of 2026-05-31

> A factual snapshot of what the `saas-ess` platform **actually is today**, verified
> against the codebase (not docs or memory). Use this as the baseline that the Birch
> Foundation implementation plan (`IMPLEMENTATION_PLAN.md`) builds on.

---

## 1. What it is

A **multi-tenant SaaS HR / Employee Self-Service (ESS) platform**. One Next.js app +
one Supabase database serves many isolated companies ("tenants"). Each tenant
configures which modules are on, who its users are, and what role each user has.

- **Repo / project name:** `saas-ess` (package name `ess`, v0.1.0)
- **Active branch:** `feature/multi-tenant-hr-system`
- **Origin story:** Started as a thin ESS frontend over a **Frappe HR** backend (the
  `README.md` and `src/config/environment.ts` still reference Frappe). It was
  **re-platformed onto Supabase**; Frappe is effectively dead code/legacy config now.
- **Intended re-use:** Designed so the same product can be re-pointed at "Employees,"
  "Members," "Volunteers," etc. per tenant — though per-tenant *terminology* is not yet
  configurable (see §7).

---

## 2. Tech stack (verified from `package.json`)

| Layer | Choice |
|---|---|
| Framework | **Next.js 15.5** (App Router, Turbopack), **React 18.3** |
| Language | TypeScript 5 |
| Backend / DB | **Supabase** — Postgres + Auth + Storage |
| Auth model | Supabase Auth (email/password); Bearer token verified server-side with the **service-role key** |
| UI | **shadcn/ui** + Radix primitives, **Tailwind CSS v4**, Lucide icons |
| State / data | **Zustand** (auth store), **TanStack React Query**, **react-hook-form** + **Zod** |
| Charts | Recharts |
| Notifications | react-hot-toast |
| Testing | Jest + Testing Library (jsdom) |
| Package manager | pnpm 8.15.4 |

`next.config.ts` sets `eslint.ignoreDuringBuilds: true` **and** `typescript.ignoreBuildErrors: true`
— builds will **not** fail on type or lint errors. (Convenient for shipping, risky for regressions.)

---

## 3. Deployment

| | |
|---|---|
| **Host** | Vercel — project `saas-ess`, team `amitshardasharmas-projects` (Node 24.x) |
| **Live URL** | **https://saas-ess.vercel.app** (HTTP 200) |
| **Last production deploy** | ~51 days ago — **branch work since then is NOT deployed** |
| **Deploy history** | Several `Error` deployments around the last push; latest *Ready* prod build = `saas-g1n5ti99y-…vercel.app` |
| **Database** | Supabase Cloud, project ref `bjbqkhhziurvmjwqoitk` (`https://bjbqkhhziurvmjwqoitk.supabase.co`) |
| **Env vars** | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (in `.env.local`, gitignored) |

> Note: the Supabase project the app points at is **not** in the org the current
> Supabase MCP token can read, so live DB introspection was not possible. The DB likely
> belongs to a separate Supabase account (possibly provisioned via the Vercel↔Supabase
> integration).

---

## 4. Architecture

### Auth & authorization (the spine of the app)
- **`src/lib/auth-middleware.ts` → `withAuth(handler, { minRole })`** wraps every API
  route. It: extracts the Bearer token → verifies it with `supabaseAdmin.auth.getUser`
  → loads the app user from `ess_app_users` (`company_id`, `role`, `is_active`) →
  enforces `minRole` → loads the employee record → builds an `AuthContext`
  (`{ authUser, appUser, employee, companyId, role }`) passed to the handler.
- **`src/lib/super-admin-middleware.ts` → `withSuperAdmin`** layers on a check for
  `is_super_admin = true`.
- **Tenant isolation is enforced in application code** by filtering every query on
  `companyId` from the auth context.

### Role model (`src/types/roles.ts`)
- Hierarchy: `employee (10) → manager (20) → hr (30) → admin (40)`, plus a separate
  `is_super_admin` boolean for platform access.
- Permission map (`PERMISSIONS`) ties named permissions to a minimum role; higher roles
  inherit lower-role permissions via `hasPermission` / `hasMinRole`.

### Module system (`src/types/roles.ts` `MODULE_IDS`)
- Toggleable modules per tenant: `leave`, `expense`, `timesheets`, `documents`,
  `appraisals`, `contracts`, `team_calendar`.
- Stored on the company's `settings.modules_enabled` and used to drive navigation.

### Routing layout
- `src/app/dashboard/**` — tenant user UI (employee/manager/hr/admin).
- `src/app/platform/**` — super-admin platform UI.
- `src/app/api/**` — **63 API route files**; `src/app/api/platform/**` for platform ops.

---

## 5. Database schema

### Version-controlled migrations (`supabase/migrations/`) — 6 files
| File | Tables created (22 total `ess_*` tables) |
|---|---|
| `001_timesheets.sql` | `ess_timesheet_configs`, `ess_projects`, `ess_timesheets`, `ess_timesheet_entries`, `ess_timesheet_approval_entries` |
| `002_documents.sql` | `ess_document_categories`, `ess_documents`, `ess_document_versions`, `ess_document_acknowledgments`, `ess_document_read_tracking` |
| `003_contracts.sql` | `ess_contract_types`, `ess_contracts`, `ess_contract_history` |
| `004_appraisals.sql` | `ess_appraisal_templates`, `ess_appraisal_cycles`, `ess_appraisals`, `ess_appraisal_responses`, `ess_goals` |
| `005_platform.sql` | `ess_platform_plans`, `ess_tenant_usage`, `ess_announcements`, `ess_announcement_dismissals` |
| `006_rls_tenant_isolation.sql` | *(no tables)* — enables RLS + `tenant_isolation` policies; adds helpers `current_company_id()` and `is_super_admin()` |

### ⚠️ Schema gaps / risks (verified)
1. **Base/core tables are NOT in migrations.** `ess_companies`, `ess_app_users`,
   `ess_employees`, `ess_leave_types`, `ess_leave_applications`, `ess_leave_allocations`,
   `ess_leave_balances`, `ess_approval_rules`, `ess_expense_claims`, `ess_expense_categories`,
   etc. are **referenced** throughout migrations/code/seed scripts but **never `CREATE`d**
   in any migration — they were created **ad-hoc directly in Supabase**. Recreating the DB
   from scratch from this repo is **not currently possible**. (The 006 RLS migration even
   `ALTER`s several of these never-created tables, so it would fail on a fresh DB.)
2. **RLS now exists but is incomplete / unverified.** `006_rls_tenant_isolation.sql`
   (added 2026-05-31) enables RLS and a `company_id = current_company_id()` `tenant_isolation`
   policy on ~21 tenant tables, plus child-table policies and a super-admin helper. **However:**
   it depends on the un-migrated base tables (so won't apply cleanly on a fresh DB), the
   child-table coverage is partly stubbed (`-- (similar child-table policies … )` comment at
   the end), and it has **not been verified as applied/working against the live DB**. The app
   still runs all API routes through the **service-role key, which bypasses RLS entirely** —
   so isolation in practice still rests on the app-layer `companyId` filter. Treat RLS as
   *in progress*, not done: confirm it's applied and write a cross-tenant denial test before
   relying on it.
3. **Known, exploitable application-layer IDOR bugs (UNFIXED — top blocker).**
   `docs/security/2026-05-31-tenant-isolation-audit.md` (2026-05-31) documents **6 cross-tenant
   IDOR findings** in route handlers that trust an ID from the URL/body without re-checking
   tenancy:
   - **CRITICAL (2):** `timesheets/[id]/entries` — any authenticated user can **wipe &
     overwrite any other tenant's timesheet** (handler comment literally says "No ownership
     verification"); `employee/[id]` — full **employee PII leak** across tenants by passing
     any UUID.
   - **HIGH (2):** `leave-applications/[id]` — approver branch lacks company scoping, so any
     approver reads other tenants' leave; `goals` (list) — `employee_id` query param returns
     any employee's goals with no company check.
   - **MEDIUM (2):** `documents/[id]/acknowledge` — forged acknowledgment writes against other
     tenants' documents; `approval-chain/[id]` — walks `reports_to` with no company check,
     disclosing another tenant's org structure.
   - Note: `process-approval` is effectively safe (scoped by `approver_id`) but lacks an
     explicit company assertion. The audit also confirms several routes ARE correctly scoped
     (e.g. `timesheets` list/create, `team-calendar`, `pending-approvals`, `goals/[id]` PATCH).
   Because every route uses the **service-role client (BYPASSRLS)**, migration `006`'s RLS
   does **NOT** mitigate these for app traffic — they must be fixed in the handlers (add
   `company_id`/ownership checks). The audit's end-state recommendation is to move tenant
   reads onto a user-scoped (JWT) client so RLS becomes the real control. **This is the #1
   pre-go-live security blocker for both the current product and the Birch build.**

---

## 6. Features actually built today

Verified against `src/app/**`, `src/services/**`, and `docs/meeting-prep-hr-system.md`.

### Staff / Employee
- Timesheets — weekly/fortnightly/monthly grid; simple-hours / project / activity modes; draft + submit
- Leave applications (type, date range, half-day, reason) + leave balance dashboard (cards/bar/pie views)
- Document library — categories, search, download, **acknowledgment** ("I have read & understood") with timestamp
- Contracts — view own contract, download PDF
- Performance goals — create/track with progress
- Self-assessment appraisals
- Expense claims — line items, categories, receipt upload, approval flow
- Profile — info, password change, photo upload

### Manager
- Approvals: timesheets, leave, expenses (approve/reject + remarks, history)
- Team leave calendar (monthly grid + list, colour-coded)
- Team leave balances table
- Team timesheets; team contracts
- Appraisal reviews (side-by-side self vs manager view)

### HR
- Document management (upload, version control, publish/unpublish, acknowledgment tracking)
- Contract management (types, upload, **expiry tracking with green/amber/red indicators**, history/audit)
- Appraisal cycles (templates, launch company-wide, track completion)
- Company-wide views across contracts/documents/appraisals/leave

### Admin
- Module configuration (toggle the 7 modules)
- Company settings (name, branding, session timeout)
- Approval rules / multi-level approval chains
- User management

### Super Admin (platform)
- Platform dashboard (tenants, users, usage, over-limit alerts)
- Tenant onboarding wizard (3 steps: org details → admin user → plan & modules)
- Plan management (Free/Starter/Professional/Enterprise; user/storage limits, allowed modules)
- Tenant admin: change plan, suspend/activate, **impersonate**, soft-delete
- Platform announcements (broadcast / target by plan or company; schedule start/expiry)
- Per-tenant usage tracking

---

## 7. What does NOT exist yet (relevant to Birch Foundation)

Grepped and confirmed absent in `src/`:
- ❌ **LMS** — no training content, modules, video hosting/linking, lessons
- ❌ **Quiz / assessment engine** (the existing "assessment" = *performance appraisal*, not quizzes)
- ❌ **Training tracking** (watch/download/quiz progress, % completion, time spent)
- ❌ **Training reporting** dashboard / CSV-Excel export of training
- ❌ **Real e-signatures** (only document *acknowledgment* exists, not signature capture)
- ❌ **Compliance / certification register** (police checks, first-aid/CPR, etc.)
- ❌ **Email sending** of any kind — no provider, no templates
- ❌ **Scheduled jobs / cron** — no reminder engine, no recertification automation
- ❌ **Per-tenant terminology/labels** (roles & terms are hard-coded)
- ❌ **Rich-text / templated / targeted internal communications** (only basic announcements)
- ⚠️ **Database-level RLS** — partially addressed by `006` but unverified/incomplete (see §5), not absent
- ❌ The word `volunteer` / `compliance` / `certification` appears nowhere in `src/`

---

## 8. Reusable foundation for the next product (~30–40%)

Real saved work that the Birch Foundation build can stand on:
- Multi-tenant SaaS shell + tenant lifecycle (onboarding wizard, suspend/impersonate/soft-delete)
- RBAC + `withAuth`/`withSuperAdmin` middleware pattern
- Module-toggle system + nav gating
- User/profile + employee model and admin listing
- Document library w/ categories, versioning, acknowledgment, Supabase Storage
- **Contract expiry-tracking pattern** (green/amber/red) — directly adaptable to certifications
- Platform announcements (basis for the comms module)
- Plans/usage/over-limit infrastructure

---

## 9. Testing & tooling
- **5 Jest test files** (components, a service, auth middleware, roles, an integration runner). Coverage is thin.
- Seed scripts: `scripts/seed-test-data.ts` (Acme Corp + Beta Inc, users at password `Test1234!`) and `scripts/seed-beta.ts`.
- CodeGraph index present (`.codegraph/`); Supabase MCP configured (`.mcp.json`).

## 10. Test credentials (from seed scripts — only valid if seeded against the live DB)
All passwords: `Test1234!` — `admin@acme.com`, `hr@acme.com`, `manager@acme.com`,
`employee1@acme.com`, `employee2@acme.com` (Acme, all modules); `admin@beta.com` (Beta, leave+expense only).
No super-admin seed script exists.
