# ESS Platform — Complete Feature Audit

> Generated 2026-06-07 by a full-repository inspection (source + live Supabase schema).
> Scope: the `saas-ess` repository (Next.js app) and its `ess_*` data layer.

## Table of Contents

- [1. High-Level Overview](#1-high-level-overview)
- [2. Complete Feature Inventory](#2-complete-feature-inventory)
- [3. User-Facing Functionality](#3-user-facing-functionality)
- [4. API & Integrations](#4-api--integrations)
- [5. Data Layer](#5-data-layer)
- [6. Cross-Cutting Concerns](#6-cross-cutting-concerns)
- [7. Gaps & Observations](#7-gaps--observations)

---

## 1. High-Level Overview

### What it is
**ESS ("Employee Self-Service") Portal** — a **multi-tenant SaaS HR / Volunteer-Management platform**. Branded in-app as *"ESS Portal — Employee Self Service"*, "Powered by techmeridian.in". It lets organisations ("companies"/tenants) manage their staff and volunteers: profiles, onboarding, leave, expenses, timesheets, documents & e-signature, compliance/certifications, training (LMS) & quizzes, performance appraisals, communications, and reporting — with a multi-level approval workflow throughout and a super-admin "Platform" control plane for tenant administration.

### Target users
- **Volunteers / Employees** — self-service: apply for leave, file expenses, log timesheets, complete onboarding/training/quizzes, sign documents, view their profile.
- **Managers** — approve requests for their direct reports, view team balances/calendar/timesheets.
- **HR / Staff** — manage documents, contracts, certifications, training, quizzes, appraisals, communications, compliance reporting.
- **Admins** — tenant configuration (modules, settings, reminders), user-profile management.
- **Super Admins** — platform operators managing all tenants, plans, usage, announcements (the `/platform` area).

### Tech stack
| Layer | Technology |
|---|---|
| Language | TypeScript |
| Framework | **Next.js 15.5** (App Router, `--turbopack` dev), **React 19** |
| UI | Tailwind CSS v4 (`@tailwindcss/postcss`), Radix UI primitives (`checkbox`, `label`, `select`, `slot`), `lucide-react`, `class-variance-authority`, `recharts` (charts), `react-hot-toast` |
| State / data | `zustand` (auth store), `@tanstack/react-query`, `react-hook-form` + `zod` + `@hookform/resolvers` |
| Backend | Next.js **API Route Handlers** (110 routes) running on Vercel functions |
| Database / Auth / Storage | **Supabase** (Postgres + Supabase Auth + Supabase Storage). Access via `@supabase/supabase-js` and `@supabase/ssr` |
| PDF / e-sign | `pdf-lib` (server-side signed-PDF rendering), Node `crypto` (sha256 hashing) |
| Email | **MailRelay** (a Resend-compatible REST API) via `fetch` |
| Hosting | **Vercel** (project `saas-ess`, org `amitshardasharmas-projects`, prod alias `saas-ess.vercel.app`), Node 24.x, Vercel Cron |
| Testing | **Jest** + Testing Library (unit/integration), **Playwright** (E2E), `tsx` (seed scripts) |

### Architecture
A **Next.js monolith** (single app, App Router) with three tiers:

1. **Client (React/SPA-ish)** — `src/app/**` pages (`'use client'`), a `zustand` auth store (`src/stores/auth.ts`), and a token kept in `localStorage` (`ess_access_token`). Login is brokered by `src/services/auth-proxy.ts`.
2. **API layer** — `src/app/api/**/route.ts` (110 endpoints). Almost all are wrapped by `withAuth`/`withSuperAdmin` (`src/lib/auth-middleware.ts`, `src/lib/super-admin-middleware.ts`) which verify a Supabase bearer token, resolve the caller's `ess_app_users` row (company + role), enforce a minimum role, and pass an `AuthContext` to the handler.
3. **Data/services layer** — `src/lib/**` (domain logic) and `src/services/**` (data services). **All DB access uses the Supabase service-role client (`supabaseAdmin`), which BYPASSES Row-Level Security** — so tenant isolation is enforced **at the application layer** by scoping every query with `company_id`. (See `src/services/esign.ts` header and `_SHARED_CONVENTIONS §6`.)

**How components connect:** Client → `fetch('/api/...')` with `Authorization: Bearer <token>` → route handler (`withAuth`) → `src/lib`/`src/services` → `supabaseAdmin` → Postgres/Storage. A **Vercel Cron** (`vercel.json`, every 5 min) calls `GET /api/cron/run-jobs` → drains the `ess_jobs` queue → dispatches to registered job handlers. A **per-tenant module system** (`src/lib/modules.ts`) gates features by `ess_companies.settings.modules_enabled`. A **temporary `src/middleware.ts` "tourniquet"** returns 401 on a small set of historically-vulnerable routes lacking a bearer header (security backstop — see §6/§7).

> ⚠️ **Shared database:** the Supabase project (`bjbqkhhziurvmjwqoitk`) is **shared with unrelated products** (`archon_*`, `mailrelay_*`, `webhook_*`, `campaigns`, `credit_*`, `llm_*`, `rag_*`, `social_media_*`, `buckets`, `conversations` …). **Only the `ess_*` tables belong to this application** — this audit covers those.

---

## 2. Complete Feature Inventory

Status legend: ✅ complete · 🟡 partial · 🟥 stub/incomplete · ⚠️ has known defect · 🧪 dev/debug.

### 2.1 Authentication & Session
- **What:** Email/password login against Supabase Auth, token storage, logout, current-user probe.
- **Where:** `src/app/api/auth/login/route.ts`, `auth/logout/route.ts`, `auth/user/route.ts`; `src/services/auth-proxy.ts`; `src/stores/auth.ts`; `src/app/login/page.tsx`; `src/lib/auth-middleware.ts`, `src/lib/super-admin-middleware.ts`.
- **How:** `POST /api/auth/login` (form `usr`/`pwd`) → `signInWithPassword` → checks active `ess_app_users` row → returns `access_token`/`refresh_token`/role. Client stores token + an `auth-storage` zustand blob. `withAuth` re-verifies the token (`auth.getUser`) on each protected call.
- **Status:** ✅ (login/logout/probe). Note: `/api/auth/user` is a **soft probe** (returns 200 `{authenticated:false}` for a bad token, by design).

### 2.2 User / People Management & Onboarding
- **What:** Centralized people directory; **Admin create/manage user profiles**; onboarding checklist workflow.
- **Where:** `src/app/api/people/route.ts` (GET list, POST create), `api/people/[id]/route.ts` (PATCH manage), `api/employee/route.ts` (own record), `api/employee/[id]/route.ts`, `api/employee/by-user/[userId]/route.ts`, `api/profile/{update,change-password,upload-photo}`; `src/lib/people-admin.ts`; `src/app/dashboard/people/*` (page, table, data); `src/app/api/onboarding/route.ts`, `onboarding/steps/[id]/route.ts`, `src/lib/onboarding.ts`, `src/app/dashboard/onboarding/page.tsx`.
- **How:** People list aggregates employee + role + active + onboarding status + signed-doc/cert counts (`people-data.ts:loadPeople`). `createPerson` provisions auth user → `ess_app_users` → `ess_employees` → `initOnboarding` (idempotent default 4-step checklist). `updatePerson` edits name/department/role/active, company-scoped, with self-lockout guards. Onboarding steps advance via `PATCH /api/onboarding/steps/[id]` → `advanceOnboarding` recomputes state.
- **Dependencies:** Supabase Auth admin API, `initOnboarding`, audit log, RBAC (`minRole:'admin'` for writes, `manager` for list).
- **Status:** ✅ (create/manage/list/onboarding shipped 2026-06; tested in `tests/e2e/e-people-management.multi.spec.ts`). Self-service profile edit is allowlisted (own record only).

### 2.3 Leave Management
- **What:** Leave types, allocations, applications, multi-level approval.
- **Where:** `api/leave-types`, `api/leave-allocations`, `api/leave-applications` (+`/[id]`), `api/team-balances`, `api/team-calendar`; `src/services/leave.ts`; `src/app/dashboard/leave-applications/*`, `team-balances`, `team-calendar`.
- **How:** Employee applies (`POST /api/leave-applications`) → display_id `LA-YYYY-NNN` → approval entries created from `ess_approval_rules`. Managers see team balances/calendar (relationship-gated via `reports_to`/`is_approver`).
- **Status:** ✅. (GET wrapped in `withAuth` after a fail-open fix; POST manual-auth but correct.)

### 2.4 Expense Claims
- **What:** Draft expense claims with line items + receipts, multi-level approval.
- **Where:** `api/expense-categories`, `api/expense-claims` (+`/[id]`, `/[id]/items`, `/[id]/receipt`); `src/app/dashboard/expense-claims/*`.
- **How:** Create claim → add items (recomputes total) → upload receipt (Storage `ess-receipts`) → submit → approval entries from rules. `[id]` routes are **uuid-keyed + company-scoped via the owning-employee join** (after a 2026-06 IDOR fix).
- **Status:** ✅ (collection routes manual-auth+scoped; `[id]` family `withAuth`+scoped).

### 2.5 Timesheets
- **What:** Period timesheets with daily entries, projects, approval; tenant config.
- **Where:** `api/timesheets` (+`/[id]`, `/[id]/entries`), `api/timesheet-config`, `api/projects`; `src/services/timesheet.ts`; `dashboard/timesheets/*`, `team-timesheets`.
- **How:** Config (`ess_timesheet_configs`: mode, cycle, required hours, OT, projects) → employee logs `ess_timesheet_entries` → submit → `ess_timesheet_approval_entries`.
- **Status:** ✅.

### 2.6 Approvals (cross-domain)
- **What:** Unified pending-approvals queue + approval history + process action for leave/expense/timesheet.
- **Where:** `api/pending-approvals`, `api/approval-history`, `api/process-approval`, `api/approval-chain/[id]`, `api/preview-approval-chain`; `dashboard/pending-approvals`, `approval-history`.
- **How:** Queue aggregates pending `*_approval_entries` for the caller as approver (level-gated). `process-approval` updates the entry + parent status.
- **Status:** ⚠️ **`process-approval` expense & leave branches filter by a `company_id` column that those tables don't have → query errors → 404 ("not found"). Expense/leave approvals via this route likely fail-closed in prod. Timesheet branch is fine (`ess_timesheets` has `company_id`).** (See §7.)

### 2.7 Documents & E-Signature
- **What:** Document library with categories, versions, role-based access, acknowledgments, read-tracking; field-templated e-signature with immutable signed records.
- **Where:** `api/documents` (+`/[id]`, `/[id]/versions`, `/[id]/fields`, `/[id]/sign`, `/[id]/acknowledge`, `/[id]/acknowledgments`, `/[id]/signature-status`), `api/document-categories`, `api/signed-documents` (+`/[id]/download`), `api/templates`; `src/services/{document,esign,esign-client}.ts`, `src/lib` esign; `dashboard/documents/*` (manage, sign, design fields, status).
- **How:** HR publishes documents (versions in Storage `ess-documents`), defines signature fields (ratio-positioned), employees sign → `esign.ts` renders a signed PDF (`pdf-lib`), sha256-hashes it, stores in private `signed-documents` bucket, writes immutable `ess_signed_documents` + append-only `ess_esign_events`, and fires the onboarding hook.
- **Status:** ✅ (well-tested: `services/__tests__/esign.test.ts`, `app/api/documents/__tests__/esign-routes.test.ts`). ⚠️ `signed-documents/[id]/download` returns **500 on a malformed (non-uuid) id** (missing input guard; foreign uuid correctly 404s).

### 2.8 Contracts
- **What:** Employee contracts with types, history, renewal reminders.
- **Where:** `api/contracts` (+`/[id]`, `/[id]/history`), `api/contract-types`; `src/services/contract.ts`; `dashboard/contracts/*`.
- **Status:** ✅.

### 2.9 Compliance / Certifications / Recertification / Reminders
- **What:** Certification types & records, compliance status refresh, expiry reminders, recertification workflow, compliance export/report.
- **Where:** `api/cert-types`, `api/certifications` (+`/[id]`, `/[id]/file`), `api/recertification`, `api/reminders` (+`/[id]`, `/run`), `api/compliance/export`, `api/reports/compliance`; `src/lib/compliance/*`, `src/lib/recertification/*`, `src/lib/reminders/*`; `dashboard/compliance`, `recertification`, `reminders`, `reports/compliance`.
- **How:** Cert records track completion/expiry; cron jobs `compliance.refresh-status`, `reminders.scan`, `recert.scan` recompute status and enqueue reminder emails (`ess_reminder_configs` → `ess_reminder_sends`).
- **Status:** ✅ (jobs + logic tested: `__tests__/lib/compliance-expiry.test.ts`, `phase7-reminders-logic.test.ts`). Reminders/recert are wired to the job runner.

### 2.10 Training (LMS) & Quizzes
- **What:** Training modules with ordered items (video/document/quiz), assignments to groups/targets, progress tracking, events; quizzes with question bank, attempts, auto + manual grading.
- **Where:** Training: `api/training/{modules,modules/[id],modules/[id]/items,modules/[id]/assignments,items/[id],groups,assigned,events,progress,track,quiz-result}`; `src/lib/training/*`, `src/services/training.ts`; `dashboard/training/*`. Quizzes: `api/quizzes` (+`/[id]`, `/[id]/duplicate`), `api/quiz-attempts` (+`/[id]/submit`), `api/grading` (+`/[id]`); `src/lib/quiz/*` (grading, randomize, timing), `src/services/quiz.ts`; `dashboard/quizzes/*`, `grading`, `training/quiz/[id]`.
- **How:** HR builds modules/quizzes → assigns to employees/groups → employees consume items & take quizzes (timed, randomized, attempt-limited) → auto-grade + manual grading queue for free-text.
- **Status:** ✅ (extensively unit-tested: `lib/quiz/*.test.ts`, `lib/training-*.test.ts`).

### 2.11 Performance: Appraisals & Goals
- **What:** Appraisal templates, cycles, employee/manager appraisals & responses, goals.
- **Where:** `api/appraisal-templates` (+`/[id]`), `api/appraisal-cycles` (+`/[id]`), `api/appraisals` (+`/[id]`), `api/goals` (+`/[id]`); `src/services/appraisal.ts`; `dashboard/appraisals/*`.
- **Status:** ✅ (appraisal write routes gated `hr`; appraisals/goals `employee` for self-assessment).

### 2.12 Communications
- **What:** HR broadcast messages (templated, targeted) + per-employee inbox; tenant announcements + dismissal.
- **Where:** `api/communications` (+`/inbox`, `/inbox/[id]`), `api/announcements/active`, `api/announcements/[id]/dismiss`; `src/lib/communications/*`, `src/services/announcement.ts`; `dashboard/communications/*`; `src/components/layout/announcement-banner.tsx`.
- **How:** HR composes (`ess_messages` + `ess_message_targets` → fan-out to `ess_message_recipients`); employees read/dismiss in inbox. Platform/tenant announcements show in a banner until dismissed.
- **Status:** ✅. (Email send path through MailRelay; tests `phase7-recipients.test.ts`.)

### 2.13 Reports & Export
- **What:** Training & compliance reports, CSV export.
- **Where:** `api/reports/training`, `api/reports/compliance`, `api/compliance/export`; `src/lib/reports/*`, `src/lib/export/*`; `dashboard/reports/*`.
- **Status:** ✅ (export tested: `__tests__/lib/export-csv.test.ts`, `phase7-export.test.ts`).

### 2.14 Platform Admin (Super-Admin control plane)
- **What:** Tenant CRUD, plans, usage metering, platform announcements, impersonation, per-tenant terminology labels, platform dashboard.
- **Where:** `api/platform/tenants` (+`/[id]`, `/[id]/users`, `/[id]/usage`, `/[id]/labels`, `/[id]/impersonate`), `api/platform/plans` (+`/[id]`), `api/platform/announcements` (+`/[id]`), `api/platform/dashboard`, `api/platform/usage/collect`; `src/services/platform.ts`; `src/app/platform/*`.
- **How:** All `withSuperAdmin`. Tenant creation provisions company + first admin (auth user) + plan/modules. Usage collected into `ess_tenant_usage`.
- **Status:** ✅. `GET /api/platform/plans` is intentionally readable by any authenticated user (pricing); writes are super-only.

### 2.15 Tenant Configuration: Modules, Settings, Labels
- **What:** Per-tenant feature flags (modules), system settings, white-label terminology.
- **Where:** `api/modules` (GET/PUT, admin), `api/settings` (admin), `api/labels`; `src/lib/modules.ts`, `src/lib/modules-deps.ts`, `src/lib/labels/*`; `src/config/nav/*` (module-gated nav); `dashboard/settings`.
- **How:** `ess_companies.settings.modules_enabled` (JSON array of 18 `MODULE_IDS`) gates routes & nav; dependency graph in `modules-deps.ts`. Labels override singular/plural terms per tenant (`ess_tenant_labels`).
- **Status:** ✅ (tested `__tests__/lib/modules.test.ts`, `labels.test.ts`).

### 2.16 Portal / Dashboard
- **Where:** `api/portal/home`, `dashboard/page.tsx`, `dashboard/portal`, `src/services/dashboard-data.ts`; `src/components/layout/{dashboard-layout,sidebar}.tsx`.
- **Status:** ✅. (Role/module-aware sidebar + role-based dashboard widgets.)

### Module flags (18)
`leave, expense, timesheets, documents, appraisals, contracts, team_calendar, profiles, documents_esign, communications, training, quizzes, training_tracking, reporting, compliance, expiry_reminders, recertification` (default enabled: `leave`, `expense`). Defined in `src/types/roles.ts` (`MODULE_IDS`).

---

## 3. User-Facing Functionality

### 3.1 Screens / pages (≈52 dashboard pages + login/platform)
| Area | Pages (`src/app/...`) |
|---|---|
| Auth | `login` |
| Dashboard | `dashboard`, `dashboard/portal` |
| People/Onboarding | `dashboard/people`, `dashboard/onboarding`, `dashboard/profile` |
| Leave | `dashboard/leave-applications` (+`/new`, `/[id]`), `team-balances`, `team-calendar` |
| Expense | `dashboard/expense-claims` (+`/new`, `/[id]`) |
| Timesheets | `dashboard/timesheets` (+`/[id]`), `team-timesheets` |
| Approvals | `dashboard/pending-approvals`, `approval-history` |
| Documents/E-sign | `dashboard/documents` (+`/manage`, `/[id]`, `/[id]/sign`, `/sign`, `/sign/[id]/design`, `/sign/status`) |
| Contracts | `dashboard/contracts` (+`/manage`) |
| Compliance | `dashboard/compliance`, `recertification`, `reminders`, `reports/compliance` |
| Training/Quizzes | `dashboard/training` (+`/manage`, `/manage/[id]`, `/quiz/[id]`, `/reports`), `quizzes` (+`/new`, `/[id]`), `grading` (+`/[id]`) |
| Appraisals | `dashboard/appraisals` (+`/cycles`, `/[id]`) |
| Communications | `dashboard/communications` (+`/compose`, `/inbox`) |
| Reports | `dashboard/reports` (+`/training`, `/compliance`) |
| Settings | `dashboard/settings` |
| Platform (super) | `src/app/platform/*` |
| 🧪 Debug | `dashboard/test-employee` |

### 3.2 Roles & RBAC matrix
Underlying roles (rank): `admin`(40) > `hr`(30) > `manager`(20) > `employee`(10), plus a separate `is_super_admin` boolean. Display tiers: **Super Admin / Admin / Staff (=hr+manager) / Volunteer (=employee)** (`roleDisplayLabel`); management surfaces use distinct labels **Admin / HR / Manager / Volunteer** (`roleManageLabel`).

| Capability | Volunteer | Manager | HR | Admin | Super Admin |
|---|:--:|:--:|:--:|:--:|:--:|
| Self (leave/expense/timesheet/profile/training) | ✅ | ✅ | ✅ | ✅ | ✅ |
| Approve own team's requests (relationship-gated) | – | ✅ | ✅ | ✅ | ✅ |
| Team balances / calendar / timesheets | – | ✅ | ✅ | ✅ | ✅ |
| People **list** (`/api/people` GET) | – | ✅ | ✅ | ✅ | ✅ |
| Manage documents/contracts/certs/training/quizzes/appraisals/communications/compliance | – | – | ✅ | ✅ | ✅ |
| Create/manage user profiles (`/api/people` POST, `/[id]` PATCH) | – | – | – | ✅ | ✅ |
| Configure modules/settings/reminders/timesheet-config | – | – | – | ✅ | ✅ |
| Platform admin (tenants/plans/usage/announcements/impersonate) | – | – | – | – | ✅ |

The hr↔manager split is real: ~55 HR-gated write routes return 403 to managers (proven in `tests/e2e/c-rbac-matrix.multi.spec.ts`).

### 3.3 Key end-to-end workflows
- **Onboard a new volunteer:** Admin → People → Add person → auto-provision login + onboarding checklist → employee completes steps → status advances.
- **Leave:** Employee applies → manager/approver approves via Pending Approvals → balances update.
- **Expense:** Employee drafts → adds items + receipts → submits → approver actions.
- **Document signing:** HR publishes + defines fields → employee signs → immutable signed PDF + audit event.
- **Compliance:** HR defines cert types → records certs → cron refreshes status + sends expiry reminders → recertification triggered on expiry.
- **Training:** HR builds module/quiz → assigns → employee completes + takes quiz → auto/manual grading → progress reports.

---

## 4. API & Integrations

### 4.1 Endpoints (110 total; auth column: role = `withAuth(minRole)`)
> Request bodies are JSON unless noted; responses are JSON `{ ... }`. Auth = `Bearer <token>` except where `NONE`.

**Auth** — `POST auth/login` (NONE; form), `POST auth/logout` (NONE), `GET auth/user` (manual, soft probe).
**People/Profile/Onboarding** — `GET,POST people` (GET manager / **POST admin**), `PATCH people/[id]` (admin), `GET employee` (manual), `GET employee/[id]` (employee), `GET employee/by-user/[userId]` (employee, company-scoped), `POST profile/update|change-password|upload-photo` (manual, self), `GET onboarding` (employee), `PATCH onboarding/steps/[id]` (employee).
**Leave** — `GET leave-types` (manual), `GET leave-allocations` (manual), `GET,POST leave-applications` (employee), `GET leave-applications/[id]` (employee), `GET team-balances|team-calendar` (manager).
**Expense** — `GET expense-categories` (manual), `GET,POST expense-claims` (manual), `GET,POST,PUT expense-claims/[id]` (employee), `GET,POST,DELETE expense-claims/[id]/items` (employee), `POST expense-claims/[id]/receipt` (employee).
**Timesheets** — `GET,POST timesheets` (employee), `GET,POST,PUT timesheets/[id]` (employee), `GET timesheets/[id]/entries` (employee), `GET,POST timesheet-config` (admin), `GET,POST projects` (hr).
**Approvals** — `GET pending-approvals` (manual), `GET approval-history` (manual), `POST process-approval` (manual ⚠️), `GET approval-chain/[id]` (employee), `GET preview-approval-chain` (employee, company-scoped).
**Documents/E-sign** — `GET,POST documents` (hr), `GET,PUT,DELETE documents/[id]` (hr), `POST documents/[id]/versions|fields` (hr), `GET documents/[id]/fields` (hr), `POST documents/[id]/sign|acknowledge` (employee), `GET documents/[id]/acknowledgments|signature-status` (hr), `GET,POST document-categories` (hr), `GET,POST templates` / `DELETE templates/[id]` (hr), `GET signed-documents` (employee), `GET signed-documents/[id]/download` (employee ⚠️ 500-on-bad-id).
**Contracts** — `GET,POST contracts` (hr), `GET,POST,PUT,DELETE contracts/[id]` (hr), `GET,POST contracts/[id]/history` (hr), `GET,POST contract-types` (hr).
**Compliance/Certs/Reminders/Recert** — `GET,POST cert-types` (hr), `GET,POST certifications` (hr), `PATCH,DELETE certifications/[id]` (hr), `GET,POST certifications/[id]/file` (hr), `GET,POST recertification` (hr), `GET,POST reminders` (admin), `PATCH,DELETE reminders/[id]` (admin), `POST reminders/run` (admin), `GET compliance/export` (hr), `GET reports/compliance` (hr).
**Training/Quizzes** — `GET,POST training/modules` (hr), `GET,PATCH,DELETE training/modules/[id]` (hr), `POST,PUT training/modules/[id]/items` (hr), `GET,POST,DELETE training/modules/[id]/assignments` (hr), `PATCH,DELETE training/items/[id]` (hr), `GET,POST training/groups` (hr), `GET training/assigned|events|progress` (employee), `POST training/track|quiz-result` (employee), `GET,POST quizzes` (hr), `GET,PUT,DELETE quizzes/[id]` (hr), `POST quizzes/[id]/duplicate` (hr), `GET,POST quiz-attempts` (employee), `POST quiz-attempts/[id]/submit` (employee), `GET grading` (hr), `GET,POST grading/[id]` (hr).
**Appraisals/Goals** — `GET,POST appraisal-templates` (hr), `GET,PUT,DELETE appraisal-templates/[id]` (hr), `GET,POST appraisal-cycles` (hr), `GET,POST,PUT appraisal-cycles/[id]` (hr), `GET appraisals` (employee), `GET,POST,PUT appraisals/[id]` (employee), `GET,POST goals` (employee), `PUT goals/[id]` (employee).
**Communications** — `GET,POST communications` (hr), `GET communications/inbox` (employee), `PATCH communications/inbox/[id]` (employee), `GET announcements/active` (employee), `POST announcements/[id]/dismiss` (employee).
**Config/Misc** — `GET,PUT modules` (admin), `GET,POST settings` (admin), `GET labels` (employee), `GET portal/home` (employee), `GET reports/training` (hr).
**Platform (super-admin)** — `GET,POST platform/tenants`, `GET,PUT,DELETE platform/tenants/[id]`, `GET platform/tenants/[id]/users|usage`, `GET,PUT platform/tenants/[id]/labels`, `POST platform/tenants/[id]/impersonate`, `GET,POST platform/plans`, `PUT,DELETE platform/plans/[id]`, `GET,POST platform/announcements`, `PUT,DELETE platform/announcements/[id]`, `GET platform/dashboard`, `POST platform/usage/collect`.
**Cron** — `GET cron/run-jobs` (CRON_SECRET via Bearer or `x-cron-secret`).

> Representative shapes — `POST /api/people` → `201 {person:{id,name,email,role,orgUnit,onboardingStatus,isActive}, temp_password?}`; errors `{error:string}`. `GET /api/people` → `{people:PersonRow[]}`. `PATCH /api/people/[id]` → `{person}`. Auth middleware returns `401 {error:'Unauthorized'}` / `403 {error:'Insufficient permissions'}`.

### 4.2 Third-party integrations
| Integration | Purpose | Where |
|---|---|---|
| **Supabase** | Postgres DB, Auth (users/sessions), Storage (`ess-documents`, `signed-documents`, `ess-receipts`, `ess-photos`) | `src/lib/supabase-*.ts`, everywhere |
| **MailRelay** (Resend-compatible) | Transactional email (reminders, communications) | `src/lib/email/send.ts` (`MAILRELAY_API_URL`/`MAILRELAY_API_KEY`) |
| **Vercel** | Hosting + Cron | `vercel.json`, `src/app/api/cron/*` |
| **Microsoft Business Central (BC)** | ERP/HR sync (planned) | `ess_companies.bc_*`, `ess_employees.bc_employee_id/bc_synced_at` — 🟥 fields exist, sync code not present (see §7) |

### 4.3 Background jobs / cron / queue
- **Queue:** `ess_jobs` (type, payload, status, run_after, attempts, last_error). Dispatch in `src/lib/jobs/dispatch.ts`, registry in `src/lib/jobs/handlers.ts`.
- **Cron:** Vercel `*/5 * * * *` → `GET /api/cron/run-jobs` (CRON_SECRET-guarded) → claims due jobs → runs handlers.
- **Registered handlers:** `compliance.refresh-status`, `reminders.scan`, `recert.scan`.
- **Manual trigger:** `POST /api/reminders/run` (admin).
- **No external webhooks** are handled by the ESS app (the shared DB's `webhook_*` tables belong to other products).

---

## 5. Data Layer

### 5.1 ESS tables (~60; all prefixed `ess_`)
**Identity/tenant:** `ess_companies` (tenant; `settings` JSON incl. `modules_enabled`, `plan`, `status`, `max_users`, `max_storage_mb`, `bc_*`), `ess_app_users` (auth↔company↔role↔is_super_admin↔is_active), `ess_employees` (profile; FK `app_user_id`, `company_id`, `reports_to`, `is_approver`, `bc_*`), `ess_platform_plans`, `ess_tenant_labels`, `ess_tenant_usage`, `ess_audit_log`.
**Leave:** `ess_leave_types`, `ess_leave_allocations`, `ess_leave_applications`, `ess_leave_approval_entries`.
**Expense:** `ess_expense_categories`, `ess_expense_claims`, `ess_expense_items`, `ess_expense_approval_entries`.
**Timesheets:** `ess_timesheet_configs`, `ess_timesheets`, `ess_timesheet_entries`, `ess_timesheet_approval_entries`, `ess_projects`.
**Approvals:** `ess_approval_rules` (+ the three `*_approval_entries` above).
**Documents/E-sign:** `ess_document_categories`, `ess_documents`, `ess_document_versions`, `ess_document_fields`, `ess_document_acknowledgments`, `ess_document_read_tracking`, `ess_signed_documents`, `ess_esign_events`.
**Contracts:** `ess_contract_types`, `ess_contracts`, `ess_contract_history`.
**Compliance:** `ess_cert_types`, `ess_certifications`, `ess_certification_history`, `ess_recertifications`, `ess_recert_history`, `ess_reminder_configs`, `ess_reminder_sends`.
**Training/Quizzes:** `ess_training_modules`, `ess_training_items`, `ess_training_assignments`, `ess_training_groups`, `ess_training_group_members`, `ess_training_progress`, `ess_training_item_progress`, `ess_training_events`, `ess_quizzes`, `ess_quiz_questions`, `ess_quiz_options`, `ess_quiz_attempts`, `ess_quiz_answers`.
**Performance:** `ess_appraisal_templates`, `ess_appraisal_cycles`, `ess_appraisals`, `ess_appraisal_responses`, `ess_goals`.
**Comms:** `ess_messages`, `ess_message_targets`, `ess_message_recipients`, `ess_message_templates`, `ess_announcements`, `ess_announcement_dismissals`.
**Onboarding:** `ess_onboarding_templates`, `ess_onboarding_states`, `ess_onboarding_steps`.
**Infra:** `ess_jobs`.

### 5.2 Key entities & relationships
- **Tenant root:** `ess_companies` → `ess_app_users` (1-n) → `ess_employees` (1-1). Most domain tables FK to `ess_employees` and/or carry `company_id`.
- **Approval pattern:** request table (`ess_leave_applications`/`ess_expense_claims`/`ess_timesheets`) → `*_approval_entries` (per level, per approver) driven by `ess_approval_rules`.
- **Versioned docs:** `ess_documents` → `ess_document_versions` → `ess_document_fields`/`ess_signed_documents` (immutable) + `ess_esign_events` (append-only).
- **Quiz tree:** `ess_quizzes` → `ess_quiz_questions` → `ess_quiz_options`; attempts → `ess_quiz_attempts` → `ess_quiz_answers`.

### 5.3 Multi-tenancy / soft-delete / audit / versioning
- **Multi-tenancy:** `company_id` on (almost) every table; **enforced in app code** (service-role bypasses RLS). Some employee-scoped tables (`ess_leave_applications`, `ess_expense_claims`) have **no `company_id`** — tenant derived via `employee_id → ess_employees.company_id` (a known footgun; see §7).
- **Audit:** `ess_audit_log` via `recordAudit()` (`src/lib/audit.ts`) — `company_id, actor_app_user_id, action, target_type, target_id, meta`. Domain history tables: `ess_contract_history`, `ess_certification_history`, `ess_recert_history`, `ess_esign_events`.
- **Versioning:** document versions; immutable signed documents/events.
- **Soft delete:** primarily **deactivation** via `ess_app_users.is_active` / `ess_employees.status`; some routes hard-DELETE (contracts, quizzes, etc.). No global soft-delete column pattern.
- **Display IDs:** `LA-YYYY-NNN`, `EC-YYYY-NNN` (per-employee sequential — **not globally unique**; `[id]` routes key on the uuid PK).

---

## 6. Cross-Cutting Concerns

### Authentication & Authorization
- Supabase bearer tokens in `localStorage`; `withAuth`/`withSuperAdmin` verify token, resolve company+role, enforce `minRole`/`is_super_admin`. Client-side `RoleGuard` (`src/components/layout/role-guard.tsx`) hides privileged UI. **A handful of legacy routes hand-roll auth** (`manual-auth` in §4) — functional but duplicated.
- **Tourniquet middleware** (`src/middleware.ts`): presence-only 401 (no token → block) on `employee/by-user/*`, `expense-claims/*`, `preview-approval-chain`, `leave-applications` — a temporary backstop from a 2026-06 security remediation (now superseded by the structural `withAuth` fixes; slated for retirement).

### Configuration / feature flags / env
- **Env vars:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, `MAILRELAY_API_URL`, `MAILRELAY_API_KEY`, `EMAIL_FROM_DEFAULT`, `EMAIL_FROM_NAME_DEFAULT`, `NEXT_PUBLIC_APP_NAME`, `NEXT_PUBLIC_APP_DESCRIPTION`, `NEXT_PUBLIC_CRM_URL`, `NEXT_PUBLIC_DEBUG`, `NEXT_PUBLIC_REMEMBER_ME_DAYS`, `NEXT_PUBLIC_SESSION_TIMEOUT`, `NEXTAUTH_URL`, `NODE_ENV`.
- **Feature flags:** per-tenant `modules_enabled` (18 module ids) gating routes + nav (`src/config/nav/*`, `src/lib/modules*.ts`).

### Logging / monitoring / error handling
- Console logging + `ess_audit_log`. No external APM/monitoring in-app. Handlers generally `try/catch` → JSON error + status; the job runner records `last_error` and retries.

### Security
- App-layer tenant scoping (service-role bypasses RLS). Cross-tenant `[id]` access → 404 (no existence leak). `zod` validation on many inputs; e-sign hashes content (sha256) and stores signed PDFs in a **private** bucket. **No rate limiting** in-app (relies on Vercel/Supabase). 2026-06 audit found & fixed 5 IDOR/unauth-exposure defects (employee-by-user, expense-claims family, preview-approval-chain, leave-applications fail-open); regression tests in `tests/e2e/`.

### Caching
- No application caching layer (no Redis). `@tanstack/react-query` provides client-side caching. API responses largely dynamic (`x-vercel-cache: BYPASS`).

### Testing coverage
- **Jest unit/integration (~33 files)** under `src/__tests__/**`, `src/lib/**/*.test.ts`, `src/services/__tests__`: auth-middleware, audit, modules, labels, quiz (grading/randomize/timing), training, esign, export, reminders logic, IDOR-regression, RLS, onboarding state machine, role display/relabel, etc.
- **Playwright E2E (5 specs)** `tests/e2e/`: `a-auth`, `c-rbac-matrix` (5-role matrix), `d-isolation` (tenant-isolation/IDOR sweep), `s-handrolled-auth`, `e-people-management`. Seeded via `tests/seed.ts`.
- **Legacy ad-hoc** `e2e/*.mjs` (10 scripts) — superseded by Playwright.
- Gaps: no coverage for several domains end-to-end (timesheets approval flow, appraisals, communications send) beyond unit tests; `process-approval` bug not caught by tests.

---

## 7. Gaps & Observations

### Confirmed defects
1. ⚠️ **`process-approval` expense & leave approvals fail-closed.** Filters `ess_expense_claims`/`ess_leave_applications` by a non-existent `company_id` column → query errors → 404. Only timesheet approvals work via this route. (`src/app/api/process-approval/route.ts`.) **Likely broken in production.**
2. ⚠️ **`signed-documents/[id]/download` 500 on malformed id** — no uuid guard; a non-uuid casts and throws (body is empty in prod, so no leak). `test.fixme` in `tests/e2e/d-isolation.multi.spec.ts`.

### Incomplete / stubbed / planned
3. 🟥 **Business Central (BC) integration** — `ess_companies.bc_*` and `ess_employees.bc_employee_id/bc_synced_at` exist, but no BC sync code is present. Appears planned/abandoned.
4. 🟥 **Payslips** — a "Payslips" nav entry exists and `src/services/dashboard-data.ts` references payslips, but there is **no `dashboard/payslips` page or `/api/payslips` route**. Stub/placeholder.
5. 🟡 **Onboarding templates** — `ess_onboarding_templates` + `template_id` exist and `initOnboarding` reads a default template, but there is **no admin UI/API to create/edit onboarding templates** (falls back to 4 hard-coded default steps).
6. 🟡 **"Up to 250 concurrent users" requirement** — the People list (`loadPeople`) loads all company rows unpaginated; fine at 250 but unoptimised and not load-tested; no concurrency provisions.

### Tech debt / risk
7. ⚠️ **`next.config.ts` sets `typescript.ignoreBuildErrors:true` and `eslint.ignoreDuringBuilds:true`** — type/lint errors do not fail the build. Real type errors can ship.
8. ⚠️ **Service-role-everywhere + app-layer scoping** — every query must remember `company_id`; the employee-scoped tables without `company_id` (leave/expense) are an ongoing footgun (already caused IDORs). Consider RLS or a scoped query helper.
9. 🟡 **Duplicated hand-rolled auth** in ~9 routes (`approval-history`, `employee`, `expense-categories`, `expense-claims` collection, `leave-allocations`, `leave-types`, `pending-approvals`, `process-approval`, `profile/*`) — works, but the next drift = the next bug. Migrate to `withAuth`.
10. 🟡 **Tourniquet middleware** is a temporary presence-only gate; it should be retired now that structural `withAuth` fixes are deployed (and ideally replaced by a CI lint asserting every `api/**/route.ts` uses `withAuth`/`withSuperAdmin` or is explicitly allowlisted).
11. 🧪 **`dashboard/test-employee`** is a debug page that should not ship to production.
12. **Shared Supabase project** with unrelated products — operational risk (a migration/outage on the shared DB affects ESS); the `ess_` prefix is the only isolation.

### Ambiguous / not fully traced
13. The exact wiring of some **dashboard widgets** (`portal/home`, `dashboard-data.ts`) to every data source wasn't traced line-by-line.
14. **Impersonation** (`platform/tenants/[id]/impersonate`) flow (token issuance/scoping) was identified but not deeply audited.
15. Whether all 18 declared **modules** have complete UI+API+nav coverage (e.g., `team_calendar` vs `training_tracking`) wasn't exhaustively cross-checked per module.
16. Several **history/event tables** (`ess_training_events`, `ess_esign_events`) — full write coverage assumed from service code but not every emit site verified.

---

*End of audit.*
