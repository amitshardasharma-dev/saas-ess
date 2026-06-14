# Birch Foundation — Phase Build Pack

Self-contained, parallel-executable phase documents for the Charity Volunteer &
Compliance Portal, built on the existing `saas-ess` multi-tenant platform.

## How to use this pack
1. **Every agent reads `_SHARED_CONVENTIONS.md` first.** It is the binding contract that
   makes parallel worktree development merge cleanly (file ownership, migration-number
   allocation, coordination-file append protocol, mandatory code patterns, Definition of Done).
2. Each phase agent works in its **own git worktree** branched from
   `feature/multi-tenant-hr-system` and builds only its phase doc.
3. Phases are designed to run **in parallel**. Build against **published contracts**, not
   other phases' implementations; stub upstream tables locally where needed (mark
   `DELETE BEFORE MERGE`) and log them in the worktree's `MERGE_NOTES.md`.
4. The orchestrator merges in **ascending phase order** (0→7).

## Documents
| File | Phase | Migration block | Brief modules |
|---|---|---|---|
| `_SHARED_CONVENTIONS.md` | — (read first) | — | — |
| `PHASE_0_foundation.md` | 0 Foundation hardening & infra | 007–015 | 0.1, 0.5, cross-cutting |
| `PHASE_1_tenant_config.md` | 1 Module access + terminology | 016–019 | 0.2, 0.3, 2 (naming) |
| `PHASE_2_profiles_onboarding_rbac.md` | 2 Profiles, onboarding, RBAC | 020–024 | 1, 2 |
| `PHASE_3_compliance_certifications.md` | 3 Compliance & certs | 025–029 | 10, 11, data for 12 |
| `PHASE_4_esignatures.md` | 4 E-signatures & doc completion | 030–034 | 3 |
| `PHASE_5_lms.md` | 5 LMS: content + tracking | 035–044 | 5, 8 |
| `PHASE_6_quiz_engine.md` | 6 Quiz engine + builder | 045–054 | 6, 7 |
| `PHASE_7_reporting_comms_portal.md` | 7 Reporting, comms, reminders, recert, portal | 055–064 | 9, 4, 12, 13, 14 |

## Dependency order (all satisfied by contract, not code)
```
0 (infra) ──► everything
1 (labels/nav/modules) ──► 2,3,4,5,6,7
2 (onboarding signals) ──► consumed by 3,4,5 (optional hooks)
3 (compliance) ──► 7 (reminders, recert, board reports)
5 (LMS) ──► 6 (quizzes), 7 (reporting, recert assignment)
6 (quizzes) ──► 5 (item completion), 7 (reporting)
```

## Companion docs (one level up)
- `../PRODUCT_STATE.md` — verified current-state snapshot of the platform.
- `../IMPLEMENTATION_PLAN.md` — phased plan overview, dependency map, risks.
- `../birch_foundation.md` — the customer requirement brief.

## Top pre-work risk (do not skip)
Phase 0 fixes **6 live cross-tenant IDOR vulnerabilities** documented in
`../../docs/security/2026-05-31-tenant-isolation-audit.md`. These are exploitable today and
are a go-live blocker. No feature phase should be merged to a deployable branch until
Phase 0's security items are closed.
