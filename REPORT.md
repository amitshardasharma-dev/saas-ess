# REPORT — Birch ESS full-role E2E (regenerated each iteration)

**Target:** http://localhost:3001 · **Tenant:** birch-e2e (disposable) · **Iteration:** 4 (BUILT_AND_PROVEN)
**Playwright HTML report:** playwright-report/index.html (regenerated this run)
**Screenshots:** artifacts/screens/<role>/ (16 full-page captures, regenerated this run)

## Roles seeded (tests/fixtures/birch-e2e.json) — pwd E2ePass123!
superadmin (platform operator), admin (Birch owner), staff (hr), vol.outreach (Street Outreach),
vol.opshop (Op Shop & Café), vol.auto (Street Outreach — dedicated to the onboarding auto-complete gate)

## Suite status (project: birch, localhost) — 95 passed · 0 skip · 0 fail
| Spec | Pass | Skip(triaged) | Fail |
|---|---|---|---|
| rbac-isolation.birch.spec.ts (5-role gate matrix + tenant isolation + volunteer negatives) | 50 | 0 | 0 |
| admin-flows.birch.spec.ts (add person + template instantiation, config, settings) | 4 | 0 | 0 |
| staff-flows.birch.spec.ts (people/profile, compliance+CSV, training report, comms; negatives) | 9 | 0 | 0 |
| superadmin-flows.birch.spec.ts (tenants, announcements, dashboard; admin != operator) | 5 | 0 | 0 |
| security.birch.spec.ts (signed-doc auth, self-lockout, cross-tenant PATCH, BASE safety) | 6 | 0 | 0 |
| volunteer-flows.birch.spec.ts (onboarding renders + negatives) | 6 | 0 | 0 |
| onboarding-autocomplete.birch.spec.ts (BUG-002 gate: full auto-complete chain + isolation) | 11 | 0 | 0 |
| screens.birch.spec.ts (per-role full-page captures) | 5 | 0 | 0 |
| **Total** | **95** | **0** | **0** |

## Keystone feature this run: typed/linked onboarding auto-complete (BUG-002)
Completing a real artifact now auto-completes the matching onboarding step (no manual tick) and rolls the
volunteer's status forward. Proven end-to-end by onboarding-autocomplete.birch.spec.ts for `volAuto`:
- **doc_sign** — e-sign the Volunteer Agreement + Code of Conduct → those steps flip to done
- **doc_ack** — acknowledge the Safeguarding Policy → its step flips to done
- **certification** — staff records Police Check + Blue Card → those steps flip + cert lands in the register
- **training** — complete the Induction (video+doc+quiz) + Safeguarding modules at 100% → those steps flip
- **status rollup** — not_started → in_progress (first auto-complete) → completed (after manual steps ticked)
- **isolation** — another volunteer with the SAME linked steps stays pending; cross-tenant done-count unchanged
- migration 058 (up + down); seed extended; no birch-foundation rows touched. BUG-002 → RESOLVED.

## Verified
- **RBAC gate matrix (5 roles):** settings-read=ALL, settings-write=admin, training-view=ALL,
  training-manage(POST)=hr+, people-list=manager+, people-create/modules-config=admin,
  compliance-export=hr+, onboarding-self=ALL. Tenant isolation: no foreign-tenant rows; foreign id -> 404.
- **ADMIN:** Add person -> 201 + temp password + 9-step Birch onboarding template instantiated;
  cert-type/document/training/reminder config reachable; Settings reachable.
- **STAFF (hr):** people list + aggregated volunteer profile (onboarding/certs/docs/training/activity);
  compliance register + CSV export; training report; comms gate passes; cannot write settings/modules.
- **VOLUNTEER:** own onboarding renders the 9 typed Birch steps (Volunteer Agreement, Code of Conduct,
  Safeguarding, National Police Check, Blue Card, Induction ...); state starts not_started; cannot list
  people / view other volunteers / write settings / reach another tenant.
- **SUPER ADMIN:** lists tenants (sees birch-e2e), reads platform announcements + dashboard; a Birch
  admin is NOT a platform operator (tenants/dashboard -> 401/403).
- **SECURITY:** signed-doc download requires auth (401) + no leak on unknown id (404/403); admin
  self-lockout guard (deactivate/demote self -> 400); cross-tenant PATCH -> 404; BASE is localhost.

## Screenshots (artifacts/screens/)
- superadmin/: 01-platform-overview, 02-tenants, 03-announcements
- admin/: 01-dashboard, 02-people, 03-compliance, 04-settings
- staff/: 01-dashboard, 02-people, 03-compliance, 04-training-report
- volOutreach/: 01-dashboard, 02-onboarding, 03-training
- volOpshop/: 01-dashboard, 02-onboarding

## Findings (BUGS.md)
- **BUG-001 (P3):** GET /api/settings exposes BC config fields to all roles (no secret leak).
- **BUG-002 (P1, RESOLVED this run):** onboarding steps now auto-complete from e-sign/cert/training
  events (typed/linked steps + migration 058). Proven by onboarding-autocomplete.birch.spec.ts.
- **BUG-003 (P2, design):** /dashboard/onboarding checklist is unstyled ("Skippending"; off-brand) --
  surfaced by screenshots. Flagged, not auto-fixed.
- **BUG-004 (P2, platform logic):** an expired/deactivated platform announcement renders on the tenant
  banner -- surfaced by screenshots. Flagged, not auto-fixed.
- **BUG-005 (P3, RESOLVED):** the 290 pre-existing repo-wide lint errors were cleared on human
  direction (full cleanup) -- type/hygiene only, no behavior changes, no rule-disabling.

## Completion-criterion status (BUILT_AND_PROVEN) -- ALL MET
- [x] typecheck clean -- `tsc --noEmit` -> **0 errors**
- [x] lint clean -- `next lint` -> **0 errors, exit 0** (18 advisory warnings remain; warnings don't fail lint)
- [x] BUG-002 onboarding spec un-skipped and PASSES — full auto-complete chain (doc_sign, doc_ack,
      certification, training) + status rollup + cross-volunteer & cross-tenant isolation (11 tests)
- [x] prior 84 tests still pass — full suite **95 passed / 0 skipped / 0 failures** (0 regressions)
- [x] e-sign/cert/training -> step auto-complete proven by the spec (no manual tick, no shortcut)
- [x] migration has up (058_onboarding_typed_steps.sql) + down (.down.sql); seed updated; no
      birch-foundation rows touched
- [x] REPORT.md + artifacts/screens/ + Playwright HTML report all regenerated this run
- [x] RALPH_LOG.md reflects every code change made
- [x] BUG-002 moved to RESOLVED in BUGS.md with the closing change set

**Mission complete (BUILT_AND_PROVEN).** Typed/linked onboarding auto-complete is built, wired at all four
artifact events, and proven by a real (un-skipped) spec; full birch suite 95/0/0; typecheck + lint clean;
migration reversible; isolation re-asserted around the new wiring.
