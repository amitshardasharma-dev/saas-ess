# Tenant Isolation Security Audit

**Date:** 2026-05-31
**Scope:** All API routes under `src/app/api/**` and the database isolation model.
**Reviewer:** Automated code audit (read-only; no changes made to the live database).

---

## Summary

The product's core promise is "complete data isolation between companies." Today
that isolation is enforced **only in application code** — every route uses the
Supabase **service-role** client (`supabaseAdmin`), which bypasses Row-Level
Security, and is expected to manually add `.eq('company_id', ...)` (or an
ownership check) to every query.

That pattern is fragile, and the audit found it has **already failed in several
routes**. Because there is no database-level safety net, each missed check is a
live cross-tenant vulnerability.

There are two independent problems, and both should be fixed:

1. **Application-layer IDOR bugs** — specific routes that read or write records by
   ID without verifying the record belongs to the caller's company. These are
   exploitable today. (Section "Findings".)
2. **No database-level isolation (no RLS)** — there is nothing behind the app code
   to contain a mistake. Migration `006_rls_tenant_isolation.sql` adds this as
   defense-in-depth. (Section "RLS".)

---

## Findings

Severity reflects exploitability and blast radius. "IDOR" = Insecure Direct Object
Reference: any authenticated user passing another tenant's record UUID.

### CRITICAL

**1. `timesheets/[id]/entries` — cross-tenant data destruction + overwrite**
The handler's own comment reads *"No ownership verification — just insert entries
with the timesheet_id from the URL."* On POST it **deletes all existing entries**
for the given `timesheet_id` and inserts new ones, with no check that the
timesheet belongs to the caller (or even to their company). Any authenticated
employee in any tenant can wipe and rewrite any other user's timesheet by
supplying its UUID.
*Fix:* load the timesheet, verify `company_id === ctx.companyId` and
`employee_id === ctx.employee.id` (or an approver relationship) before mutating.

**2. `employee/[id]` — cross-tenant employee PII leak**
GET returns `ess_employees.*` for any `id` with no company check. Any
authenticated user reads any employee record (name, employee no., department,
designation, photo, manager, approval flags) in any tenant.
*Fix:* add `.eq('company_id', ctx.companyId)` to the query.

### HIGH

**3. `leave-applications/[id]` — cross-tenant leave records via approver bypass**
GET allows access if `application.employee_id === employee.id` **or**
`employee.is_approver`. The `is_approver` branch has no company scoping, so any
user flagged as an approver can read leave applications (including reasons/dates)
from other tenants by UUID.
*Fix:* add `.eq('company_id', ctx.companyId)`; keep the approver check as an
additional in-company constraint.

**4. `goals` (list) — cross-tenant goals via `employee_id` query param**
GET reads `employee_id` from the query string (defaulting to self) and returns
that employee's goals with no check that the target is in the caller's company or
reports to them. Any user reads any employee's goals by passing their UUID.
*Fix:* resolve the target employee, verify same company (and manager/HR rights for
viewing others), then query.

### MEDIUM

**5. `documents/[id]/acknowledge` — forged / cross-tenant acknowledgment writes**
POST inserts an acknowledgment using `document_id` from the URL and `version_id`
from the body with no verification that the document belongs to the caller's
company. Lets a user write acknowledgment rows against another tenant's documents
(integrity / audit-trail pollution).
*Fix:* verify the document's `company_id === ctx.companyId` before inserting.

**6. `approval-chain/[id]` — cross-tenant org-structure disclosure**
GET walks `reports_to` from any `targetEmployeeId` with no company check, exposing
another tenant's management hierarchy and employee names.
*Fix:* verify the target employee is in `ctx.companyId` first.

### LOW / NOTE

**7. `process-approval`** is scoped by `entry.approver_id === employee.id`, which
is effectively safe (an approver can only act on entries assigned to them). It
still lacks an explicit `company_id` assertion on the parent record — add one for
consistency and defense-in-depth.

**8. Routes confirmed correctly scoped** (examples): `timesheets` (list/create),
`team-calendar`, `pending-approvals`, `goals/[id]` (PATCH), `expense-claims/[id]/items`.
These derive the filter from the authenticated `employee.id` / `companyId`, not
from client-supplied IDs — the pattern the vulnerable routes should follow.

---

## The systemic issue

The vulnerable routes all share one shape: **they trust an ID from the URL or body
and query/mutate by it without re-checking tenancy.** The safe routes all share the
opposite shape: **they derive the scope from the authenticated context.**

Manually getting this right on all ~60 routes, forever, on every future change, is
not a reliable control. That is exactly what database-level RLS is for.

---

## RLS — database-level defense in depth

`supabase/migrations/006_rls_tenant_isolation.sql` enables RLS and adds
company-scoped policies on every tenant table (direct `company_id` tables and
child tables scoped through their parent), plus helper functions
`current_company_id()` and `is_super_admin()`.

**Important caveat — RLS alone will not fix findings 1–6.** Postgres RLS does not
apply to the service-role key (it has `BYPASSRLS`), and every route uses that key.
So with the app unchanged, the policies are inert for app traffic. They DO protect
against the anon/authenticated keys (browser client, a leaked anon key, future
direct-from-client queries), which is worthwhile hardening — but the IDOR fixes
must happen in the route handlers.

To make RLS the actual enforcement layer (recommended end state), move
tenant-data reads/writes off the service-role client and onto a request-scoped
client that carries the user's JWT, so policies run for every query. That is a
larger refactor; the route-level fixes above are the immediate priority.

### Recommended remediation order

1. **Now:** patch findings 1–6 with explicit `company_id` / ownership checks
   (small, targeted diffs). Start with #1 and #2.
2. **Now:** apply migration `006` (safe — does not affect service-role traffic) to
   harden non-service-role access paths.
3. **Next:** add a regression test per fixed route asserting that a tenant-B token
   gets 404/403 for a tenant-A record. (The repo already has an integration test
   harness under `src/__tests__/integration/`.)
4. **Later:** migrate tenant reads to a user-scoped Supabase client so RLS becomes
   the primary control and app-layer checks become redundant backstops.

---

## Other observations (not isolation bugs)

- `next.config.ts` sets `typescript.ignoreBuildErrors: true` and
  `eslint.ignoreDuringBuilds: true` — type and lint errors won't fail the Vercel
  build, so regressions can ship silently. Consider turning these off in CI.
- Auth tokens are stored in `localStorage` (`ess_access_token`), which is exposed
  to XSS. httpOnly cookies are safer.
- Base tables (`ess_companies`, `ess_employees`, `ess_app_users`, and the
  leave/expense tables) are not in the repo's migrations — the schema is not fully
  reproducible from source. Consider adding a baseline migration.
- `README.md` describes the old Frappe backend, not the current Next.js + Supabase
  stack; it should be refreshed.
