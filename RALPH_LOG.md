# RALPH_LOG — Birch ESS E2E triage loop

Every code change made by the loop is recorded here: file · why · scenario it fixes.
Target: LOCAL build only (E2E_BASE=http://localhost:3001). Tenant: birch-e2e (disposable).

## Iteration 1
- Created tests/seed-birch-e2e.mjs — bootstraps the disposable `birch-e2e` tenant,
  5 per-role users, and §3 master data. (seed infra, not an app bug fix)
- Created loop scaffolding: RALPH_LOG.md, BUGS.md, REPORT.md.

## Iteration 1 (cont.)
- tests/e2e/birch/rbac-isolation.birch.spec.ts — CORRECTED wrong expectations
  (not weakening): verified vs route source that settings GET + training/modules GET
  are intentionally any-authenticated; the privileged boundary is on the writes.
  Matrix now asserts: settings-read=ALL, settings-write=admin, training-view=ALL,
  training-manage(POST)=hr. Negative test → volunteer cannot WRITE settings.
  Confirmed settings GET does not leak bc_username/bc_password (BUG-001 = P3 only).
- playwright.config.ts — added self-contained `birch` project (testMatch *.birch.spec.ts).
- tests/e2e/birch/birch-fixtures.ts — fail-closed guard: birch specs refuse to run
  unless E2E_BASE is localhost/preview (loop constraint #1).

## Iteration 2
- tests/e2e/birch/birch-fixtures.ts — added service-role cleanup helper (cleanupUser) so
  create-tests self-clean. (test infra)
- tests/e2e/birch/admin-flows.birch.spec.ts — NEW: add-person provisions login + temp pwd +
  instantiates the 9-step onboarding template; config endpoints reachable; settings reachable.
- tests/e2e/birch/volunteer-flows.birch.spec.ts — NEW: own onboarding renders typed steps;
  volunteer negatives (people/settings/other-volunteer/other-tenant). Auto-complete = test.fixme (BUG-002).

## Iteration 3
### Test suite (Birch E2E — completes the role matrix + artifacts)
- tests/e2e/birch/staff-flows.birch.spec.ts — NEW: staff (hr) people list/profile aggregation,
  compliance register + CSV export, training report, comms gate; negatives (no settings/modules config).
- tests/e2e/birch/superadmin-flows.birch.spec.ts — NEW: platform operator lists tenants (sees
  birch-e2e), reads announcements + platform dashboard; Birch admin is NOT a platform operator.
- tests/e2e/birch/security.birch.spec.ts — NEW: signed-doc download auth boundary (401 + no leak),
  admin self-lockout guard (400), cross-tenant PATCH → 404, BASE-is-localhost safety.
- tests/e2e/birch/screens.birch.spec.ts — NEW: drives the REAL login form per role and captures
  16 full-page screenshots → artifacts/screens/<role>/<step>.png (completion-criterion artifact).
- tests/e2e/birch/birch-fixtures.ts — FLAKY FIX: memoized tokenFor (per-worker _tokenCache Map,
  one in-flight login per email) — clears the "Request rate limit reached" failures from the
  parallel login burst on Supabase auth. (test infra; ALLOWED flaky-wait class)
- tests/e2e/birch/screens.birch.spec.ts — FLAKY FIX: login() waits for networkidle + asserts the
  controlled inputs hold their value before submit (a hydration race was submitting an empty form,
  surfacing "Enter a valid email"). (test infra)

### Pre-existing TYPECHECK errors fixed (ALLOWED: type/import errors; none Birch-related,
### but the completion criterion requires `tsc --noEmit` clean)
- src/app/dashboard/documents/[id]/sign/page.tsx — used a non-existent method `signDocument` +
  non-existent type `FieldValueInput`; corrected to esignService.sign(...) with the camelCase
  shape + fieldValues Record keyed by field_key; guards missing versionId.
- src/types/quiz.ts — QuestionDraft.accepted_answers made required string[] to match the
  zod-inferred QuizUpsertInput (schema uses .default([]) → non-optional). newQuestion/toDraft
  already always set it, so no behavior change.
- src/lib/quiz/randomize.test.ts — reduce accumulator null-guard ((a ?? 0) + (b ?? 0)).
- tests/e2e/fixtures.ts — added `unregistered`/`inactive` to the Fixtures type (both already
  present in users.json; type just didn't declare them).
- src/app/api/portal/home/route.ts — fixed an invalid type-guard predicate (Record<string,unknown>
  not assignable to the mapped object type) → x is NonNullable<typeof x>.
- src/app/api/certifications/[id]/file/route.ts — un-exported CERT_BUCKET (Next route files may
  only export route handlers + config; the const is file-local).
- src/__tests__/role-relabel.test.ts — removed the unresolved `@jest/globals` import (ambient
  @types/jest is installed) and corrected roleDisplayLabel('super_admin') → roleDisplayLabel('admin', true)
  (super-admin label comes from the isSuperAdmin flag, not a role string — same assertion, correct API).
- src/__tests__/{phase-2-rls,onboarding-state-machine,api/certifications.contract}.test.ts — removed
  the unresolved `@jest/globals` import; phase-2-rls: annotated it.each `(table: string)` params.

Result: `tsc --noEmit` → 0 errors (was ~19 pre-existing). The Birch suite + every file edited
this loop is also lint-clean (verified per-file). See BUGS.md BUG-005 for the repo-wide lint debt.

### Pre-existing LINT cleanup — repo-wide (user-directed; BUG-005 resolved)
Per a human decision ("full repo lint cleanup first"), cleared ALL 290 pre-existing `next lint`
errors across 82 files (156 no-explicit-any, 122 no-unused-vars, 7 no-unescaped-entities,
4 no-require-imports, 1 no-unsafe-function-type). Done via 6 parallel agents over disjoint file
sets (tests, dashboard pages, API appraisals/contracts/docs, API approvals/timesheets/misc,
platform, components/services/stores), then a whole-repo `tsc` + `next lint` reconciliation sweep.
- Fix classes (NO runtime/behavior/auth changes, NO eslint-disable, NO config edits):
  - no-explicit-any → precise types from context (domain interfaces, Supabase row shapes typed via
    local row types cast through `unknown`, zod-parsed bodies); `unknown` + narrowing where genuinely
    dynamic; generics in safe-toast wrappers; `Record<string, unknown>` for opaque JSON.
  - no-unused-vars → removed dead imports/vars; `catch {}` for unused errors; removed sole unused
    handler params; copy-and-`delete` strip pattern for `_id/_company_id/_created_at` destructures.
  - no-require-imports → ES imports; no-unescaped-entities → escaped; no-unsafe-function-type → typed sig.
- Files touched span src/__tests__, src/app/dashboard, src/app/api, src/app/platform, src/components,
  src/services, src/stores, src/lib, src/types, src/utils. (Full per-file list in the loop transcript.)

FINAL STATE: `tsc --noEmit` → 0 errors · `next lint` → 0 errors (exit 0; 18 advisory warnings remain:
react-hooks/exhaustive-deps + 1 no-img-element — warnings, not errors, do not fail lint). Birch suite
re-run after the refactor: 84 passed, 1 triaged-skip (BUG-002), 0 failures — no regression.

═══════════════════════════════════════════════════════════════════════════════
# RALPH_LOG — Birch ESS: typed/linked onboarding + auto-complete (BUILT_AND_PROVEN loop)
═══════════════════════════════════════════════════════════════════════════════

## Mission: build BUG-002 (typed onboarding steps auto-complete from artifact events)

### Data model (additive + reversible migration)
- supabase/migrations/058_onboarding_typed_steps.sql (UP) + 058_onboarding_typed_steps.down.sql (DOWN)
  — adds step_type/ref_kind/ref_id/auto_complete to ess_onboarding_steps + a step_type CHECK + the
  (employee_id, step_type, ref_id) lookup index. Existing rows default to step_type='manual'
  (no backfill destruction). Applied to the birch-e2e Supabase project; down drops only what up added.
- src/types/onboarding.ts — OnboardingStepType + OnboardingRefKind; OnboardingStep gains the 4 fields.

### Engine
- src/lib/onboarding.ts — NEW completeLinkedOnboardingStep(employeeId, {stepType, refId}): finds THIS
  employee's auto_complete step matching (step_type, ref_id), flips it done, recomputes status. Keyed on
  employee_id → structurally tenant-safe (an artifact event can only ever complete the acting employee's
  own step). initOnboarding now copies step_type/ref_kind/ref_id/auto_complete from the template.

### Auto-complete wiring (4 artifact events → matching step type)
- src/services/esign.ts — createSignedDocument now completes the doc_sign step (ref=documentId) via a
  STATIC import of completeLinkedOnboardingStep (the prior dynamic import('@/services/onboarding') was a
  dead no-op + dynamic alias import failed under turbopack). Wraps in try/catch (best-effort).
- src/app/api/documents/[id]/acknowledge/route.ts — completes the doc_ack step (ref=documentId) after ack.
- src/app/api/certifications/route.ts — completes the certification step (ref=cert_type_id) on cert insert;
  no longer gated on cert_type.required (linkage, not the required flag, decides relevance). Removed the
  now-unused maybeAdvanceOnboarding import + `required` var.
- src/lib/training/onboarding.ts + src/lib/training/tracking.ts — tryAdvanceOnboarding(employeeId, moduleId)
  completes the training step (ref=moduleId) when a module hits 100%; static import of @/lib/onboarding.

### Seed (typed template + real artifacts the gate drives)
- tests/seed-birch-e2e.mjs — reordered: create cert types / documents (+ versions + a source PDF in the
  ess-documents bucket + a signature field for the two e-sign docs) / training modules (+ items +
  role='employee' assignments) FIRST, capture ids, then build the TYPED template steps referencing them,
  then instantiate per-volunteer. Added a dedicated `volAuto` volunteer (mutated by the gate spec) so
  volOutreach/volOpshop stay pristine for the other specs. Exports fixtures.onboarding {docs, certTypes,
  modules} for the spec. Only birch-e2e rows touched.
- tests/e2e/birch/birch-fixtures.ts — FX type extended with the onboarding section.

### The gate (BUG-002 fixme → real passing spec)
- tests/e2e/birch/onboarding-autocomplete.birch.spec.ts — NEW serial spec (11 tests) proving the FULL
  chain for volAuto: doc_sign (Agreement + Code of Conduct), doc_ack (Safeguarding Policy), certification
  (Police Check + Blue Card, + lands in register), training (Induction video+doc+quiz, Safeguarding video)
  → each step auto-completes WITHOUT a manual tick; status not_started→in_progress→completed; isolation:
  another volunteer with the SAME linked steps is untouched + cross-tenant done-count unchanged.
- tests/e2e/birch/volunteer-flows.birch.spec.ts — removed the BUG-002 test.fixme (coverage moved to the
  dedicated gate spec; this spec's pristine-onboarding assertions stay valid via the volAuto split).

RESULT: full birch suite 95 passed / 0 skipped / 0 failures (was 84 + 1 fixme). `tsc --noEmit` 0 errors,
`next lint` 0 errors. No birch-foundation rows touched. REPORT/screens/HTML report regenerated.
