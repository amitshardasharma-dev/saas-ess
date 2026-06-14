# BUGS — failures NOT auto-fixed (flagged for human review)

Severity: P0 (security/data integrity) · P1 (major broken path) · P2 (minor) · P3 (cosmetic).
Auto-fix policy: ONLY mechanical (selectors, seed, flaky waits, wiring 404/500, type/import).
FLAG ONLY: RBAC outcomes, tenant leaks, compliance/expiry math, e-sign integrity, design.

_(populated during runs)_

## Iteration 1

### BUG-001 (P3, FLAG) — GET /api/settings exposes BC config fields to all authenticated roles
- Role: any authenticated (incl. volunteer). Scenario: RBAC settings-read.
- Detail: `GET /api/settings` is bare `withAuth` (any role). It returns app config
  (company name/slug, `bc_enabled`, `bc_api_url`, `bc_company_id`, `modules_enabled`).
  Verified it does NOT leak `bc_username`/`bc_password` (handler returns a curated
  subset). So no credential leak — but a volunteer can read the Business-Central
  endpoint/company id, which is internal-ish config.
- Severity: P3 (minor info exposure; not a secret leak).
- Proposed fix (DESIGN — not auto-applied): drop `bc_*` from the volunteer-visible
  response, or gate those fields behind `minRole:'admin'`; keep `modules_enabled`
  + branding for all (the client needs those).
- File: src/app/api/settings/route.ts (GET handler).

## Iteration 2

### BUG-002 (P1, RESOLVED) — onboarding steps now auto-complete from artifact events
- Role: volunteer. Scenario: e-sign / cert upload / training completion → onboarding step auto-completes.
- Detail: onboarding steps are not typed/linked to artifacts; signing a document, uploading a
  cert, or completing a training module does NOT flip the matching step or advance status.
  Steps are completed only manually/seeded. Tracked in BIRCH_FOUNDATION_ESS_BLUEPRINT.md §6 (P0).
- Severity: P1 (core onboarding value missing; not a regression).
- Proposed fix (FEATURE — requires product sign-off): add step_type + ref_kind/ref_id to
  ess_onboarding_steps; on e-sign/cert/training events, find the matching step → mark done →
  advanceOnboarding(). Represented in the suite as a test.fixme until built.
- Files: src/lib/onboarding.ts, src/services/esign.ts (onboarding hook), src/app/api/certifications,
  src/services/training.ts.
- RESOLUTION (BUILT_AND_PROVEN loop): exactly as proposed. Migration 058 added
  step_type/ref_kind/ref_id/auto_complete (up + down). `completeLinkedOnboardingStep(employeeId,
  {stepType, refId})` finds + flips the acting employee's matching auto_complete step, then
  advanceOnboarding(). Wired at all four artifact events: doc_sign (esign createSignedDocument),
  doc_ack (documents/[id]/acknowledge), certification (certifications POST, by cert_type_id), training
  (training tracking recomputeModuleProgress at 100%, by module_id). Seed gives the birch-e2e template
  typed/linked steps + real artifacts. Proven by tests/e2e/birch/onboarding-autocomplete.birch.spec.ts
  (11 tests: all four step types auto-complete without a manual tick; status not_started→in_progress→
  completed; + cross-volunteer and cross-tenant isolation). The prior test.fixme was removed (not
  weakened): full birch suite now 95 passed / 0 skipped / 0 failures.
- Closing change set (range) on branch feature/multi-tenant-hr-system:
  - DB: supabase/migrations/058_onboarding_typed_steps.sql (+ .down.sql)
  - types/engine: src/types/onboarding.ts, src/lib/onboarding.ts (completeLinkedOnboardingStep + init copy)
  - wiring: src/services/esign.ts, src/app/api/documents/[id]/acknowledge/route.ts,
    src/app/api/certifications/route.ts, src/lib/training/onboarding.ts, src/lib/training/tracking.ts
  - seed/spec: tests/seed-birch-e2e.mjs, tests/e2e/birch/birch-fixtures.ts,
    tests/e2e/birch/onboarding-autocomplete.birch.spec.ts, tests/e2e/birch/volunteer-flows.birch.spec.ts

## Iteration 3

### BUG-003 (P2, FLAG — design/UI, do NOT auto-fix in triage loop) — onboarding checklist is unstyled
- Role: volunteer (and anyone viewing /dashboard/onboarding). Scenario: "My Onboarding renders".
- Detail: `src/components/onboarding/onboarding-checklist.tsx` renders raw, unstyled HTML
  (`<ul>/<li>/<label><input>/<button>Skip</button><span>{status}</span>`) with no Tailwind classes.
  Visible result (artifacts/screens/volOutreach/02-onboarding.png): the "Skip" button and the
  status text collide as "Skippending", and the whole surface is inconsistent with the app shell.
- Evidence: artifacts/screens/volOutreach/02-onboarding.png, artifacts/screens/volOpshop/02-onboarding.png.
- Severity: P2 (a primary volunteer surface looks unfinished / off-brand; directly conflicts with the
  "whole app should look like one application" requirement). FUNCTIONALLY works (steps render, status
  correct) — this is purely presentation, hence flagged not auto-fixed under the triage policy.
- Proposed fix (DESIGN): restyle the checklist to the app's card/list system — space the Skip control
  from the status chip, use status chips (pending/done/skipped) consistent with the People view chips.
- File: src/components/onboarding/onboarding-checklist.tsx.

### BUG-004 (P2, FLAG — platform business logic, do NOT auto-fix) — expired announcement renders on tenant banner
- Role: all tenant roles (observed on admin + volunteer dashboards). Scenario: super-admin announcement
  targeting / "platform banner must not render incorrectly to a Birch tenant".
- Detail: the tenant announcement banner shows an announcement titled "Deactivated-1775746501939"
  (body "Test") which the platform Announcements list marks with the `expired` badge. An announcement
  that is expired/deactivated should not surface on the tenant banner. (The active, All-Tenants
  "Test All / For everyone" announcements rendering IS correct — that is the intended broadcast.)
- Evidence: artifacts/screens/admin/01-dashboard.png, artifacts/screens/superadmin/03-announcements.png.
- Caveat: these 18 announcements are PRE-EXISTING platform-global test data (not seeded by birch-e2e);
  the suspected defect is in the banner's active/expiry filter, not in my seed. Needs confirmation of
  the announcement expiry/active model before any fix — flagged, not auto-fixed.
- Severity: P2 (stale internal content leaks to end-users; not a cross-tenant data leak).
- Suspected files: the AnnouncementBanner query/filter (active + within start/expiry window) + its API route.

### BUG-005 (P3, RESOLVED — repo-wide lint debt cleared on human direction) — `next lint` reported 290 errors
- Scope: ~90 files across appraisals, contracts, timesheets, platform, dashboard pages, services,
  stores. Rules: `@typescript-eslint/no-explicit-any` (majority) + `@typescript-eslint/no-unused-vars`.
- Detail: this debt PREDATES the Ralph loop and is unrelated to the Birch ESS E2E mission. Verified:
  the Birch E2E suite and EVERY file edited by this loop are lint-clean (0 errors each). The loop
  introduced zero new lint errors.
- Impact on completion criterion: the criterion's literal "lint clean" (whole-repo `next lint` exit 0)
  is blocked by pre-existing debt that cannot be cleared without a large, regression-risky refactor of
  features outside this mission. typecheck (`tsc --noEmit`) IS now clean (0 errors).
- Severity: P3 (code hygiene; no runtime/security impact).
- RESOLUTION (human-directed "full repo lint cleanup first"): all 290 errors fixed across 82 files via
  6 parallel agents over disjoint file sets + a whole-repo reconciliation sweep. Type/hygiene only — no
  runtime/behavior/auth changes, no eslint-disable directives, no config edits (rules untouched, so this
  is NOT gaming the check). FINAL: `tsc --noEmit` 0 errors · `next lint` 0 errors (exit 0). 18 advisory
  warnings remain (react-hooks/exhaustive-deps + 1 no-img-element — warnings, not errors). Birch suite
  re-run post-refactor: 84 passed / 1 triaged-skip / 0 failures (no regression). See RALPH_LOG.md.
