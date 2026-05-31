# Phase 2 — Profiles, Onboarding Workflow & RBAC Relabel

> **Self-contained build doc.** Read `_SHARED_CONVENTIONS.md` first. Migration block:
> **`020`–`024`**. Brief modules: 1 (User Profile Management), 2 (RBAC).

---

## 1. Mission
1. Relabel the role tiers to **Super Admin / Admin / Staff / Volunteer** (display only,
   via Phase 1 resolver — no data change).
2. Add an **onboarding workflow** with per-user status (Invited → Documents Pending →
   Training Pending → Active) shown on profile + admin dashboard.
3. Add an **onboarding checklist** per user (required steps + completion state).
4. Surface **document & certification tracking** widgets on the profile (data fed by
   Phases 3/4 — build widgets to consume their published contracts, degrade gracefully).

## 2. Owned files / namespace
- `src/app/dashboard/profile/**` (extend), `src/app/dashboard/onboarding/**` (new)
- `src/app/platform/.../users` or `src/app/dashboard/people/**` (admin user dashboard) (new)
- `src/components/profile/**`, `src/components/onboarding/**` (new)
- `src/app/api/onboarding/**`, `src/app/api/people/**` (new)
- `src/services/onboarding.ts`, `src/types/onboarding.ts` (new)
- `src/config/nav/phase-2-onboarding.nav.tsx` (new) + append to `navigation.ts` PHASE-2 markers
- `supabase/migrations/020_*.sql`…`024_*.sql`
- `scripts/seed-phase-2.ts`

## 3. Migrations (block 020–024)
- **`020_onboarding.sql`**:
  - `ess_onboarding_states` — `id, company_id, employee_id (unique), status text check
    in ('invited','documents_pending','training_pending','active','suspended'), updated_at`.
  - `ess_onboarding_steps` — `id, company_id, employee_id, step_key text, label text,
    required boolean, status text check in ('pending','complete','waived'), completed_at,
    sort_order`. (A user's checklist = rows here.)
  - `ess_onboarding_templates` — optional per-tenant default step set
    (`id, company_id, step_key, label, required, sort_order`).
  - RLS on all (direct `company_id`).
- `021`–`024` reserved.

## 4. Work items
- **RBAC relabel**: use `useLabels()` everywhere roles are shown; map the 4 display tiers
  to underlying roles per Phase 1's documented mapping. Confirm the permission matrix in
  `roles.ts` already matches brief tiers (Admin=full tenant config, Staff=admin functions +
  oversight, Volunteer=own data). No new role values.
- **Onboarding status**: on user create (existing tenant onboarding wizard / people admin),
  initialize `ess_onboarding_states` = `invited` and instantiate checklist from the tenant
  template. Status transitions: an API + small state machine (`advanceOnboarding(employeeId)`)
  that recomputes status from checklist completion + linked doc/cert/training signals.
- **Checklist UI**: on the volunteer's profile, show their checklist with what's required
  and done; allow Staff/Admin to waive/mark steps.
- **Admin people dashboard**: searchable/filterable list of all users with role, org unit,
  onboarding status, and counts of outstanding docs / expiring certs (consume Phase 3/4
  contracts; if absent in your worktree, show "—" and guard with feature flags).
- **Profile tracking widgets**: "Required documents" (Phase 4 `ess_signed_documents` /
  acknowledgments) and "Certifications" (Phase 3 `ess_certifications`) — render from those
  published contracts; behind a try/catch + module-enabled guard so the profile works even
  before Phases 3/4 merge.

## 5. Contracts PUBLISHED
- `ess_onboarding_states`, `ess_onboarding_steps`, `ess_onboarding_templates`.
- `advanceOnboarding(employeeId)` + `GET /api/onboarding?employee_id=` + `PATCH /api/onboarding/steps/[id]`.
- Onboarding status enum (above) — Phases 3/4/5 may call `advanceOnboarding` after their
  events (cert added, doc signed, training done) via the published function/endpoint.

## 6. Contracts CONSUMED (stub if needed)
- Phase 1: `useLabels()`, nav registry/markers, `MODULE_IDS` (`profiles`).
- Phase 0: `recordAudit`, baseline `ess_employees`/`ess_app_users`.
- Phase 3: `ess_certifications` (read-only widget). Phase 4: signed-docs (read-only widget).
  Both optional — guard their absence.

## 7. Tests
- Onboarding state machine: completing all required steps → status `active`.
- Checklist RLS denial across tenants.
- People dashboard filters (by role, org unit, status) return correct scoped rows.

## 8. Seed (`scripts/seed-phase-2.ts`)
- A default onboarding template for Birch (steps: sign code of conduct, complete induction
  training, upload police check). Several volunteers at varying onboarding stages.

## 9. Acceptance criteria
- [ ] A new volunteer starts at `invited`; completing checklist advances to `active`.
- [ ] Admin dashboard lists all users with status + outstanding items, filterable.
- [ ] Role labels everywhere read from the resolver (Volunteer/Staff/Admin/Super Admin).
- [ ] Profile shows checklist; Staff can waive a step. RLS + tests pass; `pnpm build` passes.

## 10. MERGE_NOTES
Migrations 020(+); nav append under PHASE-2 markers; any onboarding-signal hooks other
phases should call; stubs used for Phase 3/4 widgets.
