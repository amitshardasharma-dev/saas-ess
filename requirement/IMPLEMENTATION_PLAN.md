# Implementation Plan — Birch Foundation Charity Volunteer & Compliance Portal

> **Source brief:** `requirement/birch_foundation.md`
> **Current baseline:** `requirement/PRODUCT_STATE.md`
> **Date:** 2026-05-31
> **Scope rule (from brief):** Every feature in the brief is in MVP scope. Nothing deferred.
> **Strategy:** Build on the existing multi-tenant ESS platform. Birch Foundation is the
> first tenant; the product stays configuration-driven so it can be re-pointed at other
> orgs later.

---

## How to read this plan

The brief's 15 modules (0–14) are resequenced into **8 delivery phases** ordered by
**dependency** and **risk**, not by brief number. Each phase is shippable and testable on
its own. Tags carried from the brief: **[Have]** built · **[Enhance]** extend/relabel ·
**[New]** net-new.

**Effort scale** (rough, single competent full-stack dev, calendar weeks incl. test):
S = ≤1 wk · M = 1–2 wks · L = 2–4 wks · XL = 4–6 wks.

```
Phase 0  Foundation hardening & infra            ← unblocks everything
Phase 1  Tenant config: modules + terminology    ← unblocks correct labels everywhere
Phase 2  Profiles, onboarding & RBAC relabel
Phase 3  Compliance & certification engine       ← core charity value
Phase 4  E-signatures & document completion
Phase 5  LMS: training content + tracking        ← largest subsystem
Phase 6  Quiz & assessment engine + admin builder
Phase 7  Reporting, communications & portal polish
```

---

## Phase 0 — Foundation hardening & shared infrastructure
**Why first:** The whole compliance product is undermined if isolation leaks or if there
is no way to send email / run scheduled jobs. Several later modules (12, 13, 4, comms)
*cannot exist* without this. This also closes the two biggest current-state risks.

**Brief modules:** 0.1 (isolation), cross-cutting infra.

| # | Work | Tag | Effort |
|---|---|---|---|
| 0.1 | **Capture base schema as migrations.** Reverse-engineer the un-migrated core tables (`ess_companies`, `ess_app_users`, `ess_employees`, `ess_leave_*`, `ess_expense_*`, `ess_approval_rules`) into version-controlled SQL so the DB is reproducible. **Blocker:** `006` already `ALTER`s some of these, so it currently can't run on a fresh DB — this migration must land before/with it. | New | M |
| 0.2 | **Fix the 6 known IDOR bugs (CRITICAL — top blocker).** `docs/security/2026-05-31-tenant-isolation-audit.md` lists 6 cross-tenant IDOR findings: 2 CRITICAL (`timesheets/[id]/entries` data destruction, `employee/[id]` PII leak), 2 HIGH (`leave-applications/[id]`, `goals` list), 2 MEDIUM (`documents/[id]/acknowledge`, `approval-chain/[id]`). Add explicit `company_id`/ownership checks; service-role key means RLS does *not* cover these for app traffic. Audit's order: patch CRITICAL (#1,#2) first, then HIGH/MEDIUM, then add a per-route regression test (tenant-B token → 403/404 on tenant-A record). | New | M |
| 0.2b | **Verify & complete RLS.** `006` enables RLS + `tenant_isolation` on ~21 tables (added 2026-05-31) as defence-in-depth. Confirm it applies cleanly on the rebuilt schema, complete any stubbed coverage, and prove isolation with a cross-tenant denial test. | Enhance | M |
| 0.3 | **Email delivery infrastructure** — integrate **MailRelay** (`https://email.relevel.ai/api/emails`, Resend-compatible REST, Bearer `sk_live_...`, call via `fetch` — no npm pkg). Sending service (`sendEmail`) + templating primitive + per-tenant from-identity. | New | M |
| 0.4 | **Scheduled job runner** — Vercel Cron endpoints + a job dispatch table, idempotent, with run logging. Shared by reminders, recertification, comms scheduling. | New | M |
| 0.5 | **Platform audit log** (brief 0.5) — record platform-admin actions (tenant create/suspend, module/label changes, impersonation). | New | S |
| 0.6 | Turn **off** `ignoreBuildErrors` / `ignoreDuringBuilds` once the tree is clean, so regressions fail CI. | New | S |
| 0.7 | **Load/scale check** — confirm 250 concurrent users/tenant (brief 0.1). Mostly validation + indexing. | New | S |

**Exit criteria:** DB reproducible from migrations on a fresh project (core tables included);
`006` applies cleanly and RLS is **proven** to block cross-tenant reads in a test; a test
email sends; a cron job fires and logs; audit log records an action.

---

## Phase 1 — Tenant configuration: module access + terminology
**Why here:** Every later screen, email, and export must render the *tenant's* words
("Volunteer" not "Employee") and respect per-tenant module access. Building this before
the feature modules avoids reworking labels across the whole UI later.

**Brief modules:** 0.2, 0.3, 0.4 (mostly Have), 2 (naming part).

| # | Work | Tag | Effort |
|---|---|---|---|
| 1.1 | Extend per-tenant **module access** to the new modules (Profiles, Documents/E-Sign, Communications, Training, Quizzes, Tracking, Reporting, Compliance, Reminders, Recertification). | Enhance | S |
| 1.2 | **Module dependency enforcement** (Recertification ⇒ Training + Compliance; Quizzes ⇒ Training). Validation in admin UI + route guards. | New | S |
| 1.3 | Disabled modules **disappear cleanly** — hidden in nav, routes 403. | Enhance | S |
| 1.4 | **Terminology engine** — per-tenant rename of core concepts (person/supervisor/org-unit/certification/training-module/document), singular + plural, sensible defaults. | New | M |
| 1.5 | **Label resolver** applied everywhere — screens, buttons, nav, **emails, reports, CSV headers, PDF docs**. A single `t(term)` style resolver wired through UI + server render + export generators. | New | M |
| 1.6 | Confirm tenant provisioning/branding (logo/color to portal, login, emails, reports) covers new surfaces. | Have/Enhance | S |

**Exit criteria:** Admin can rename "Employee"→"Volunteer" and it changes consistently in
UI, an email, and a CSV export; disabling a module hides nav and blocks its routes.

---

## Phase 2 — Profiles, onboarding workflow & RBAC relabel
**Why here:** Low-risk, high-clarity; establishes the user records and statuses that
compliance/training hang off.

**Brief modules:** 1 (Profiles), 2 (RBAC).

| # | Work | Tag | Effort |
|---|---|---|---|
| 2.1 | Relabel roles to **Super Admin / Admin / Staff / Volunteer**, driven by the Phase-1 terminology config. Map: admin→Admin, hr/manager→Staff, employee→Volunteer, super-admin unchanged. Confirm permission matrix matches brief tiers. | Enhance | M |
| 2.2 | **Onboarding workflow status** per user (e.g. Invited → Documents Pending → Training Pending → Active), visible on profile + admin dashboard. | Enhance | M |
| 2.3 | **Onboarding checklist** per user — required steps + completion state, auto-updated by document/training/compliance events. | New | M |
| 2.4 | **Document & certification tracking on profile** — outstanding/completed/signed docs; current/expiring/expired certs. (Surfaces Phase 3/4 data.) | Enhance | S |

**Exit criteria:** A new volunteer can be invited and progresses through onboarding
states; admin dashboard shows each user's status and outstanding items.

> Note: 2.4's data sources land in Phases 3–4; build the profile widgets to consume them
> incrementally.

---

## Phase 3 — Compliance & certification engine
**Why here:** This is the core charity value (police checks, first aid/CPR) and it extends
the **existing contract-expiry pattern** — so it's medium effort, not net-new from zero.
It must precede reminders (12) and recertification (13).

**Brief modules:** 10 (Compliance Register), 11 (Cert Expiry Mgmt), part of 12.

| # | Work | Tag | Effort |
|---|---|---|---|
| 3.1 | **Certification/compliance register** per user — generalize `ess_contracts`/`ess_contract_types` into cert types with validity periods. | Enhance | M |
| 3.2 | **Auto-calc expiry** from completion date per cert type's validity. | Enhance | S |
| 3.3 | **Visual indicators** (green/amber/red) in profiles + admin dashboards (reuse contract indicator). Upcoming/overdue surfaced proactively. | Enhance | S |
| 3.4 | **Compliance reporting** — who is compliant/expiring/overdue, exportable (CSV/Excel). | New | M |
| 3.5 | **Audit trail** of compliance records and changes (reuse contract history). | Have/Enhance | S |

**Exit criteria:** Upload a police check with a completion date → expiry auto-set →
red/amber/green shows on profile and dashboard → compliance export lists statuses.

---

## Phase 4 — E-signatures & in-portal document completion
**Why here:** Builds on the existing document library + versioning + acknowledgment; needed
for onboarding completion. Independent of the LMS, so can run parallel to Phase 5 if staffed.

**Brief modules:** 3.

| # | Work | Tag | Effort |
|---|---|---|---|
| 4.1 | **In-portal document completion** — fillable fields within the portal (no print/scan). | New | M |
| 4.2 | **Digital signature capture** — typed-name and/or drawn signature, bound to doc + version, with timestamp & signer identity. | New | M |
| 4.3 | **Signed-document storage** linked to profile (Supabase Storage), immutable signed copy. | New | S |
| 4.4 | **Signature audit trail** — who signed what version, when, from where (IP/time). | Have/Enhance | S |

**Exit criteria:** A volunteer completes and signs an onboarding form in-portal; a signed
PDF is stored against their profile with a full audit record.

---

## Phase 5 — LMS: training content management + automated tracking
**Why here:** Largest net-new subsystem. Content + tracking come before quizzes (Phase 6)
because a quiz attaches to a module and feeds module completion.

**Brief modules:** 5 (Content), 8 (Tracking).

| # | Work | Tag | Effort |
|---|---|---|---|
| 5.1 | **Content model** — documents (upload) + videos (external URL: YouTube/Vimeo/other). | New | M |
| 5.2 | **Training modules** — ordered set of videos/documents/quizzes. | New | M |
| 5.3 | **Assignment to groups** — by role, org unit, or custom group. | New | M |
| 5.4 | **Volunteer learning view** — assigned modules, progress, what remains. | New | M |
| 5.5 | **Tracking:** video watch acknowledgement; document download + ack; quiz attempts/scores/pass-fail (hooks to Phase 6); module % complete; **time spent per component**; full historical record. | New | L |

**Exit criteria:** Admin builds a module with a video + a doc, assigns it to volunteers;
a volunteer completes it; tracking shows % complete, time spent, and history.

---

## Phase 6 — Quiz & assessment engine + no-code admin builder
**Why here:** Depends on the LMS module container (Phase 5). Most complex single feature
(essay grading, time limits, randomization).

**Brief modules:** 6 (Engine), 7 (Admin interface).

| # | Work | Tag | Effort |
|---|---|---|---|
| 6.1 | **Question types:** MC single, MC multi, True/False, short answer, essay/long-form. | New | L |
| 6.2 | **Config:** passing score, attempt limit, randomization, time limit, feedback timing (immediate/after-submit/after-close), answer explanations. | New | M |
| 6.3 | **Auto-grading** for objective types; **manual-grade queue** for essay/short-answer (Staff workflow). | New | M |
| 6.4 | **Quiz ↔ module link** — pass/fail feeds training completion (wires into 5.5). | New | S |
| 6.5 | **No-code quiz builder** — Staff create/edit/duplicate/delete quizzes + all config via UI, no developer needed. | New | L |

**Exit criteria:** Staff build a mixed-type quiz via UI; volunteer takes it under a time
limit; objective questions auto-grade; an essay lands in the manual queue; pass marks the
module complete.

---

## Phase 7 — Reporting, communications & portal integration
**Why last:** These consume data and infrastructure from all prior phases.

**Brief modules:** 9 (Training reporting), 4 (Comms), 12–13 automation, 14 (Portal).

| # | Work | Tag | Effort |
|---|---|---|---|
| 7.1 | **Training reporting dashboard** — all users' progress; filter by user/org-unit/module/status; CSV/Excel export; visual stats for Board. | New | M |
| 7.2 | **Internal communications** — compose memos/announcements; **rich-text**; **reusable templates**; **targeted delivery** (role/org-unit/training-group/individual); in-portal inbox/banner + send audit. | Enhance/New | L |
| 7.3 | **Automated expiry reminders** (uses Phase 0 email+cron) — configurable timing (90/30/7/on/after), customizable content/tone, frequency (one-time/weekly/daily-overdue), auto-escalation to supervisor/admin. | New | L |
| 7.4 | **Recertification workflow** — auto-assign recert training on expiry (uses Phases 3+5), track recert history, cert→expiry→recert audit trail, Board/regulatory compliance reports. | New | L |
| 7.5 | **Website portal integration** — footer-linkable login entry point; volunteer portal home (training/certs/documents/updates); mini-CRM ↔ ESS cross-navigation / shared identity. | New | M |

**Exit criteria:** An expiring cert triggers a reminder email on schedule, escalates if
overdue, and auto-assigns recert training; Board can export a compliance + training report;
volunteers reach the portal from the public website footer.

---

## Dependency map (what blocks what)

```
Phase 0 (infra: schema, RLS, email, cron, audit)
   ├── unblocks → Phase 3 (compliance audit)
   ├── unblocks → Phase 7.3 reminders / 7.4 recert (email + cron)
   └── unblocks → Phase 4.4 / 4 audit
Phase 1 (modules + terminology)
   └── unblocks → correct labels/exports in ALL later phases
Phase 2 (profiles/onboarding/RBAC)
   └── feeds → onboarding states consumed by 3,4,5
Phase 3 (compliance/certs) ──→ required by 7.3 reminders, 7.4 recert
Phase 5 (LMS content+tracking) ──→ required by 6 (quizzes), 7.4 recert, 7.1 reporting
Phase 6 (quizzes) ──→ feeds 5.5 completion, 7.1 reporting
```

**Possible parallelization** (with 2 devs): Phase 4 (e-sign) can run alongside Phase 5
(LMS); Phase 3 (compliance) can start once Phase 0 infra lands.

---

## Build-weight summary (mirrors the brief)

| Weight | Phases / modules | Why |
|---|---|---|
| **Heaviest** | Phase 5 + 6 (LMS, tracking, quizzes, quiz admin) | Net-new, largest surface; essay grading + time limits |
| **Heavy** | Phase 7.3–7.4 (reminders, recertification) | Needs cron + email + cross-module orchestration |
| **Heavy (infra)** | Phase 0 (schema/RLS/email/cron) | Cross-cutting prerequisites |
| **Medium** | Phase 4 (e-sign), 7.2 (comms), 3 (compliance/expiry) | Build on existing document/contract patterns |
| **Light** | Phase 1 (config), 2 (profiles/RBAC), 7.5 (portal) | Relabel/config/extend |

---

## Cross-cutting requirements (enforced every phase)
- Per-tenant labels resolved across UI, emails, exports (Phase 1 resolver).
- Role-based access on every new screen + route (`withAuth`/`withSuperAdmin`).
- RLS extended to every new table (Phase 0 pattern).
- Audit trails on documents, signatures, compliance, and training records.
- Each phase ships with tests and is deployable behind its module toggle.

---

## Risks & open questions
1. **Live DB access** — the production Supabase project isn't reachable from the current
   MCP token; confirm ownership/credentials before Phase 0 schema reverse-engineering.
2. **Stale deployment** — production is ~51 days behind the branch; align and redeploy
   before building on top.
2a. **Un-migrated core schema** — the base tables exist only in the live DB, not in repo
   migrations, and `006` references them. Reverse-engineering them (Phase 0.1) is a hard
   prerequisite and depends on resolving the live-DB access question (risk 1).
3. ~~Essay grading scope~~ **RESOLVED:** full scope — all 5 question types incl. essay +
   manual-grade queue are in MVP (Phase 6).
4. ~~Email/cron provider~~ **RESOLVED:** Email = **MailRelay** (`email.relevel.ai`,
   Resend-compatible REST, call via fetch — no `resend` pkg); jobs = **Vercel Cron**
   (`/api/cron/run-jobs` every 5 min).
   ~~**Role mapping RESOLVED:**~~ admin→Admin, hr→Staff, manager→Staff, employee→Volunteer,
   super_admin→Super Admin (display labels only).
5. **Data residency** — brief mentions compliance; confirm region requirements for the
   Supabase project and email provider.
6. **250 concurrent users** — validate as a real concurrency target vs. total user count.
7. **Open security audit** — `docs/security/2026-05-31-tenant-isolation-audit.md` has 6
   IDOR findings (2 CRITICAL / 2 HIGH / 2 MEDIUM). These are live and exploitable today and
   must be closed in Phase 0.2 before any go-live or new feature work on top. The audit also
   flags: tokens in `localStorage` (XSS-exposed; prefer httpOnly cookies), un-migrated base
   tables, and the `ignoreBuildErrors` config — all reflected elsewhere in this plan.
