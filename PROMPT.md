# PROMPT.md — Birch ESS full-role E2E + triage loop

## Mission
Exercise every critical path of the Birch Foundation ESS portal from ALL four RBAC
perspectives, capture screenshots, produce a report, and fix only mechanical bugs.
Flag everything else for human review. Iterate until the completion criterion is met.

## HARD CONSTRAINTS (never violate)
1. Target the LOCAL/PREVIEW build only (BASE_URL must be localhost or a vercel
   preview URL). If BASE_URL points at the live prod tenant, STOP and emit
   <promise>UNSAFE_TARGET</promise>.
2. Use a disposable seeded tenant `birch-e2e` (NOT `birch-foundation`). If it
   doesn't exist, write/extend a seed script to create it + per-role test users
   (§Accounts) + the §3 master data from the blueprint, then proceed.
3. NEVER weaken the test suite to pass: do not delete/skip tests, lower
   passing_score, loosen assertions, or change expected behavior to match a bug.
   Doing so is a failure, not progress.
4. Log every code change to RALPH_LOG.md (file, why, scenario it fixes).

## Accounts (bootstrap if missing, via seed script)
- superadmin@e2e  -> platform is_super_admin (TechMeridian operator)
- admin@e2e       -> Birch `admin`  (org owner)
- staff@e2e       -> Birch `hr`
- vol.outreach@e2e-> Birch `employee`, program: Street Outreach
- vol.opshop@e2e  -> Birch `employee`, program: Op Shop & Café

## Scenario matrix (Playwright, one spec file per role)
VOLUNTEER (outreach + opshop):
- login via /login -> My Onboarding renders typed steps + progress bar
- e-sign Volunteer Agreement -> signed PDF appears on profile, step auto-completes
- upload a certification w/ expiry (Police, Blue Card) -> lands in compliance register
- complete a training module (video ack + doc ack) -> pass quiz -> module 100% ->
  onboarding training step auto-completes
- status rolls not_started -> in_progress -> completed
- NEGATIVE: cannot open /dashboard/people, /dashboard/settings; cannot see other
  volunteers or any other tenant's data

STAFF (hr):
- People list (search/filter/paginate) -> open a volunteer profile (all tabs)
- manage that volunteer's docs / training / compliance
- Compliance register filters by program; valid/expiring/overdue chips correct
- Training report renders + CSV export downloads
- compose + send a comm targeted to "Street Outreach" group
- NEGATIVE: /dashboard/settings + module config are blocked

ADMIN (Birch owner):
- everything Staff can, plus: Add person -> provisions login + temp pwd +
  instantiates the role's onboarding template
- configure a cert type / document / training module / reminder config
- Settings reachable
- NEGATIVE: cannot cross tenant boundary (no birch-foundation or other-tenant rows)

SUPER ADMIN (platform):
- tenant management + platform announcement targeting (all / specific_tenants)
- confirm a platform "Test All" banner does NOT render as a Birch tenant banner

CROSS-CUTTING SECURITY (run as each role):
- tenant isolation: no row from another tenant ever returned
- private bucket: signed-PDF URL is not publicly fetchable without auth
- self-lockout guard: admin cannot deactivate/demote their own last-admin account

## Screenshots
- full-page screenshot at each labeled step -> artifacts/screens/<role>/<step>.png
- Playwright trace + screenshot on every failure (configure in playwright.config)

## Report (regenerate every iteration)
- Playwright HTML report (built-in)
- REPORT.md roll-up: pass/fail per role, per scenario, with thumbnail links
- BUGS.md: every failure NOT auto-fixed -> {id, role, scenario, severity
  (P0..P3), repro steps, suspected root cause, PROPOSED fix}. Do not apply
  proposed fixes for business-logic/RBAC/compliance items.

## Bug-fix policy
ALLOWED to fix automatically: broken/changed selectors, missing routes returning
404/500 due to obvious wiring gaps, missing/incorrect seed data, flaky waits,
import/type errors. After each fix, re-run the affected spec.
FLAG ONLY (BUGS.md, no code change): wrong RBAC outcome, tenant leak, incorrect
compliance/expiry calculation, e-sign integrity issues, anything requiring a
product/design decision.

## Per-iteration procedure
1. Read RALPH_LOG.md, BUGS.md, last report -> see prior progress.
2. Run: typecheck, lint, then `playwright test`.
3. For each failure: classify ALLOWED vs FLAG. Fix the ALLOWED ones; append the
   FLAG ones to BUGS.md.
4. Regenerate REPORT.md + screenshots.
5. Re-run the suite.

## Completion criterion (machine-checkable)
Emit <promise>E2E_TRIAGED</promise> only when ALL hold:
- typecheck clean AND lint clean
- every Playwright spec either PASSES or its failure is recorded in BUGS.md with
  severity + repro + proposed fix (no untriaged red)
- REPORT.md + artifacts/screens/ + Playwright HTML report all regenerated this run
- RALPH_LOG.md reflects every code change made
If a security/isolation NEGATIVE test fails, mark it P0 in BUGS.md and STILL emit
the promise (it's triaged) — do NOT try to auto-fix a security boundary.

## Promise hygiene (critical)
Do NOT write the literal string <prom...ise> tag anywhere except as the actual
final completion signal. When explaining that the task is NOT yet complete,
refer to it as "the completion promise" or "the E2E_TRIAGED tag" in PROSE — never
type the angle-bracket form. Emitting the tag in any other context will falsely
terminate the loop.