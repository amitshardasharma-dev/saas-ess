# Birch Foundation — ESS Portal Configuration & Enhancement Blueprint

> **Purpose:** Translate the 14-feature ESS specification into a concrete, build-ready plan **for Birch Foundation specifically**. For every module this document states: the requirement, what the codebase has **today**, the **enhancement** needed, the **Birch configuration** (seed data) to apply, and the **end-user journey**. The build team uses this to construct what's missing.
> **Tenant:** Birch Foundation (`birch-foundation`) — live on `saas-ess.vercel.app`.
> **Generated:** 2026-06-14, from the live codebase + the Birch Foundation website.
> Status legend: ✅ built · 🟡 partial · ❌ missing.

## Table of contents
- [1. Tenant context — who we're building for](#1-tenant-context)
- [2. The core model — how it all clicks together](#2-the-core-model)
- [3. Birch master configuration (seed data)](#3-birch-master-configuration)
- [4. Module-by-module: current state → enhancement → config](#4-module-by-module)
- [5. End-to-end journeys](#5-end-to-end-journeys)
- [6. Data-model & technical enhancements](#6-data-model--technical-enhancements)
- [7. Build backlog (prioritised)](#7-build-backlog)
- [8. Open decisions for Birch](#8-open-decisions)

---

## 1. Tenant context

**Birch Foundation** is a registered Australian charity (DGR-endorsed), **Gold Coast, QLD**, established 2023. Mission: support people experiencing **hardship, homelessness, and domestic/family violence (DV)**. It is **volunteer-driven** — volunteers are "the heart of everything."

**Operating programs (→ volunteer roles):**
| Program | What volunteers do | Risk/compliance profile |
|---|---|---|
| **Street Outreach** | Van runs (Surfers Paradise Mon, Southport Wed); care packages, clothing, conversation | High — field work with vulnerable/homeless people; lone-ish work |
| **Op Shop & Café** | Sort donations, serve customers, run the coffee bar (Mon–Sat) | Food handling, manual handling, public-facing |
| **Events & Initiatives** | Bunnings sausage sizzles, fundraisers, Care & Lifestyle Expo (seniors/aged-care/disability) | Around children & vulnerable adults; food |
| **DV Support & Referrals** | Support people affected by domestic/family violence (partner: Oracle Law) | **Highest** — confidential, sensitive personal data |
| **Admin & Marketing** | Admin, social, grant writing (remote ok) | Handles personal/donor data |
| **Fundraising** | Drives, donor engagement | Low |

**Implication for the portal:** Birch is unpaid volunteers, **not paid staff** → no payroll/leave/expense/timesheets/payslips (correctly disabled for this tenant). The ESS portal for Birch is, in plain terms, a **Volunteer Onboarding & Compliance System**: recruit → onboard a volunteer against the right legal checks for their role → keep those checks current → train them → keep auditable records for the Board and regulators.

Working with vulnerable people in QLD means **real statutory checks**: **Blue Card** (Working-With-Children Check, QLD), **National Police Check**, **First Aid/CPR**, plus **Food Safety** (café/op shop), **Safeguarding/DV training**, and signed **Code of Conduct / Confidentiality**. These are the backbone of Birch's configuration below.

---

## 2. The core model

The 14 features are **not 14 silos** — they form one system:

```
              ┌─────────────────────────── PROFILE (the spine) ───────────────────────────┐
              │  identity · role/program · status · onboarding % · documents · certs · training · history │
              └───────────────▲───────────────────────▲───────────────────────▲───────────┘
                              │                        │                        │
                    Onboarding ENGINE  ─────────── orchestrates ───────────────┘
                              │ (typed, role-based checklist; each step is a real action)
        ┌─────────────────────┼─────────────────────┬───────────────────────┬─────────────────┐
        ▼                     ▼                     ▼                       ▼                 ▼
  E-Signatures         Compliance/Certs        Training+Quizzes        Communications     Manual tasks
  (sign agreements)    (upload Blue Card,       (induction, safeguarding (welcome, nudges) (induction mtg)
   → signed PDF on      Police, First Aid       DV, food safety + quiz)
   profile, step ✅)    + expiry → register,    → complete → step ✅
                        reminders, recert
```

**Principles**
1. **The profile is the single record** of a volunteer — everything rolls up to it.
2. **Onboarding is an engine, not a checkbox list.** Each step has a **type** and is **linked to a real artifact** (a document to sign, a cert to upload, a training module). Completing the real action **auto-completes** the step.
3. **Role drives everything.** A volunteer's **program/role** selects an **onboarding template** = the exact set of checks/docs/training they need.
4. **Compliance is a lifecycle, not a one-off.** After onboarding, certs are watched → reminders → recertification when they lapse.
5. **One truth, two audiences.** Volunteers see *their* checklist; Admin/Staff see *everyone's* status + the Board-ready reports.

### RBAC mapping (spec's 4 tiers → current roles)
The code has underlying roles `admin(40) > hr(30) > manager(20) > employee(10)` + a platform `is_super_admin` flag.

| Spec tier | Maps to | Notes |
|---|---|---|
| **Super Admin** | `admin` (Birch org owner) | Full view + edit + **Settings/module config**. *Platform `is_super_admin` = TechMeridian/SaaS operator, NOT a Birch role.* |
| **Admin** | `admin` | Same role today. To split Super-vs-Admin, gate **Settings** to the owner only (see §8). |
| **Staff** | `hr` | Administrative functions + volunteer oversight (manage people/docs/training/compliance), **no** system config. |
| **Volunteer** | `employee` | Own profile, onboarding, training, documents only. |
| 🟡 Gap | — | The spec's Super-vs-Admin split is cosmetic today (both = `admin`). Recommend: **Admin = `admin`, Staff = `hr`, Volunteer = `employee`**; decide Super/Admin in §8. |

---

## 3. Birch master configuration

This is the **seed data** to load for the `birch-foundation` tenant. (Modules already enabled: profiles, documents, documents_esign, communications, training, quizzes, training_tracking, reporting, compliance, expiry_reminders, recertification.)

### 3.1 Programs / org units (also used as training groups)
`Street Outreach · Op Shop & Café · Events & Initiatives · DV Support · Admin & Marketing · Fundraising`

### 3.2 Certification types (`ess_cert_types`)
| Cert | validity_months | file? | reminder offsets (days) | Applies to |
|---|---|---|---|---|
| National Police Check | 36 | yes | 90, 30, 7, 0, +overdue | All |
| **Blue Card** (WWCC QLD) | 36 | yes | 90, 30, 7, 0, +overdue | Outreach, Events, DV |
| First Aid (HLTAID011) | 36 | yes | 90, 30, 7, 0 | Outreach, (opt. others) |
| CPR (HLTAID009) | 12 | yes | 60, 30, 7, 0 | Outreach |
| Food Safety (handling) | 60 | yes | 90, 30, 0 | Op Shop & Café, Events (food) |
| Manual Handling / WHS induction | 12 | internal | 30, 7, 0 | Op Shop, Outreach |
| NDIS Worker Screening / Yellow Card | 60 | yes | 90, 30, 0 | DV/disability events (optional) |

### 3.3 Documents to complete & sign (`ess_documents` + fields, e-sign)
| Document | Type | Who |
|---|---|---|
| Volunteer Agreement | sign | All |
| Code of Conduct | sign | All |
| Confidentiality & Privacy Agreement | sign | DV, Admin, Outreach |
| Child-Safe / Safeguarding Policy | acknowledge | All |
| Photo & Media Consent | sign | All |
| WHS Policy | acknowledge | Op Shop, Outreach, Events |

### 3.4 Training modules (`ess_training_modules` → items → quiz)
| Module | Content | Quiz | Who |
|---|---|---|---|
| Volunteer Induction | org video + welcome doc | short pass-quiz | All |
| Safeguarding & Child-Safe | video/doc | quiz (pass 80%) | All |
| DV & Trauma-Informed Awareness | video/doc | quiz | Outreach, DV |
| WHS & Manual Handling | video | quiz | Op Shop, Outreach |
| Food Safety Basics | video/doc | quiz | Op Shop & Café, Events |
| Privacy & Confidentiality | doc | quiz | DV, Admin |

### 3.5 Onboarding templates per role (the heart of it)
Each cell = a **typed onboarding step**. ✓ = required for that role.

| Step (type) | Outreach | Op Shop/Café | Events | DV Support | Admin/Mktg | Fundraising |
|---|:--:|:--:|:--:|:--:|:--:|:--:|
| Complete profile *(profile_field)* | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Sign Volunteer Agreement *(doc_sign)* | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Sign Code of Conduct *(doc_sign)* | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Sign Confidentiality & Privacy *(doc_sign)* | ✓ | – | – | ✓ | ✓ | – |
| Acknowledge Safeguarding policy *(doc_ack)* | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Photo/Media consent *(doc_sign)* | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Upload Police Check *(certification)* | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Upload Blue Card *(certification)* | ✓ | – | ✓ | ✓ | – | – |
| Upload First Aid + CPR *(certification)* | ✓ | opt | – | – | – | – |
| Upload Food Safety *(certification)* | – | ✓ | ✓ | – | – | – |
| Volunteer Induction training *(training)* | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Safeguarding training + quiz *(training)* | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| DV/Trauma training + quiz *(training)* | ✓ | – | – | ✓ | – | – |
| WHS/Manual handling *(training)* | ✓ | ✓ | – | – | – | – |
| Food Safety training *(training)* | – | ✓ | ✓ | – | – | – |
| Induction meeting *(manual task)* | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

### 3.6 Expiry reminder configs (`ess_reminder_configs`)
- Applies to: all certification types.
- Pre-expiry: email at **90 / 30 / 7 days** and **on expiry** (one-time each).
- Overdue: **weekly** until resolved, **escalate to Staff/Admin**.
- Tone: friendly, Birch-branded; include "how to renew" link.

### 3.7 Communication templates (`ess_message_templates`)
Welcome / onboarding kickoff · "You have outstanding onboarding steps" nudge · Roster/shift notice · Event call-out (e.g., Thursday Giveback, sausage sizzle) · Certification-expiring nudge.

---

## 4. Module-by-module

### 4.1 User Profile Management
- **Spec:** create/manage profiles with onboarding status + document tracking; centralized dashboard; up to 250 users.
- **Current:** ✅ People list (search/filter), ✅ Add person (admin) provisions login + temp password + onboarding init, ✅ edit role/department/active, ✅ self-lockout & cross-tenant guards. `src/app/dashboard/people/*`, `src/lib/people-admin.ts`, `src/app/api/people/*`.
- **Enhancements (❌/🟡):**
  - ❌ **Per-volunteer profile page** with tabs: Overview · Onboarding · Documents · Certifications (with expiry) · Training · Activity. *This is the "complete record in one place" — currently missing.*
  - 🟡 **Richer profile fields** in create/edit: phone, emergency contact, designation/availability, program/role, photo (DB columns exist; UI exposes only name/email/role/dept).
  - 🟡 **Program/role field** distinct from "department" — drives the onboarding template (see 3.5).
  - 🟡 **Pagination + sort** on the people list for the 250-user scale (currently loads all).
  - ❌ **Document tracking on the profile** (the signed docs + uploaded certs themselves, not just counts).
- **Journey:** Admin adds a volunteer → picks **program** → correct onboarding template instantiates → volunteer appears with live status; clicking the row opens the full record.

### 4.2 Role-Based Access Control
- **Spec:** Super Admin / Admin / Staff / Volunteer.
- **Current:** ✅ `withAuth`/`withSuperAdmin`, role ranks, route + nav gating, RoleGuard. Tested (RBAC matrix + isolation).
- **Enhancements:** 🟡 adopt the mapping in §2 (Admin=`admin`, Staff=`hr`, Volunteer=`employee`); decide Super-vs-Admin (§8). 🟡 relabel UI tiers to Birch's words ("Staff", "Volunteer") — `roleManageLabel` already supports distinct labels.

### 4.3 Document Completion & E-Signatures
- **Spec:** in-system completion + digital signature; secure storage linked to profile; version control + audit trail.
- **Current:** ✅ Strong. Documents, versions, signature **fields** (ratio-positioned), sign flow, **signed PDF** rendered (`pdf-lib`) + sha256 hashed + stored in a **private** bucket, immutable `ess_signed_documents` + append-only `ess_esign_events`, acknowledgments, version control. Well-tested. `src/services/esign.ts`, `src/app/api/documents/**`.
- **Enhancements:**
  - ❌ **Seed Birch's documents** (3.3) with their signature fields.
  - 🟡 **Link signing to onboarding** — signing the Volunteer Agreement should auto-complete the matching onboarding step (the e-sign onboarding hook exists but must target the *typed* step — see §6).
  - 🟡 Surface signed docs on the **profile** (Documents tab).
- **Journey:** Volunteer opens "Sign Volunteer Agreement" from their onboarding → fills fields → signs → PDF stored on profile → step ✅.

### 4.4 Internal Communications
- **Spec:** memos/announcements, templates with rich text, targeted to groups/individuals, internal only.
- **Current:** ✅ `ess_messages` + targets + recipients + **templates** + inbox; ✅ tenant-scoped. Platform announcements (banner) support `all`/`specific_tenants`/`specific_plans` targeting (the "Test All" banners are *platform* broadcasts, not a leak). `src/lib/communications/*`, `src/app/api/communications/*`.
- **Enhancements:**
  - 🟡 **Targeting by program/training-group** (e.g., "all Street Outreach volunteers") — wire message targets to the §3.1 groups.
  - 🟡 **Rich-text editor** in compose (confirm WYSIWYG vs plain HTML).
  - ❌ Seed Birch **templates** (3.7).
  - 🧹 Clean up the test platform announcements so Birch's banner is empty unless Birch/TechMeridian posts.
- **Journey:** Staff → Compose → pick template → target "Street Outreach" group → send → lands in those volunteers' inboxes.

### 4.5 Training Content Management
- **Spec:** upload/link videos (YouTube/Vimeo/other) + documents; organise into modules; assign to groups.
- **Current:** ✅ Modules → items (video/document/quiz), ✅ **YouTube/Vimeo** provider detection (`src/lib/training/video.ts`), ✅ assignments to groups/targets. `src/app/api/training/**`.
- **Enhancements:** ❌ Seed Birch **modules** (3.4) + content; 🟡 define **training groups** = programs (3.1) and auto-assign by role; 🟡 confirm generic/self-hosted video embed beyond YT/Vimeo.
- **Journey:** Admin creates "Safeguarding" module → adds a Vimeo video + a policy PDF + a quiz → assigns to "All volunteers" group.

### 4.6 Quiz & Assessment Engine
- **Spec:** MC single/multi, True/False, short answer, essay; passing score, attempt limits, randomization, time limits, feedback timing, explanations.
- **Current:** ✅ **All 5 question types** (`mc_single, mc_multi, true_false, short_answer, essay`), ✅ passing_score, attempt_limit, randomize, time_limit, feedback_timing, show_explanations; ✅ auto-grade objective + configured short-answer; ✅ **manual grading queue** for essay/short. `src/lib/quiz/*` (well-tested).
- **Enhancements:** mostly ✅. 🟡 Seed Birch quizzes per module (3.4). Minor UX polish.
- **Journey:** Coordinator builds a Safeguarding quiz (pass 80%, 2 attempts, randomized) → attached to the module.

### 4.7 Automated Training Tracking
- **Spec:** video-watch ack, doc download/ack, quiz attempts/scores/pass-fail, module %, time spent, history.
- **Current:** ✅ `training_item_progress`, `training_progress` (%), `training_events` (`video_watched`, `doc_downloaded`, `doc_acknowledged`, `time_tick`), `quiz_attempts` (score/passed/time_spent). Covers all spec points. `src/services/training.ts`.
- **Enhancements:** 🟡 video "watch completion" is an **acknowledgement/marker** event (not %-of-video) — confirm acceptable to Birch; 🟡 feed module completion into the matching **onboarding training step** (auto-complete).
- **Journey:** Volunteer watches video (marked) → reads doc (ack) → passes quiz → module hits 100% → onboarding step ✅.

### 4.8 Training Reporting Dashboard
- **Spec:** admin view of all progress; filter by user/department/module/status; export CSV/Excel; visual indicators.
- **Current:** ✅ training report + CSV export. `src/app/dashboard/reports/training`, `src/lib/reports/*`, `src/lib/export/*`.
- **Enhancements:** 🟡 filter by **program** (Birch's "department"); 🟡 visual progress bars/badges; 🟡 "who needs follow-up" view; ensure Board-ready export.

### 4.9 Compliance Document Register
- **Spec:** central register of policies/procedures/compliance docs; auto expiry tracking (police, first aid/CPR…); compliance reporting + audit.
- **Current:** ✅ cert types + certifications (completion/expiry/file), ✅ status refresh job, ✅ compliance page + report + export, ✅ history. `src/lib/compliance/*`, `src/app/api/certifications/*`.
- **Enhancements:** ❌ Seed Birch **cert types** (3.2); 🟡 a true **"register" view** combining policy documents *and* certifications; 🟡 per-program required-cert matrix so "missing/overdue" is computed against role requirements.
- **Journey:** Compliance officer opens Register → sees every volunteer's certs with valid/expiring/overdue status, filter by program.

### 4.10 Automated Expiry Reminders
- **Spec:** configurable timing (90/30/7/on/after), customizable content+tone, frequency (one-time/weekly/daily overdue), escalation.
- **Current:** ✅ `ess_reminder_configs` (offsets, frequency, email subject/body, **escalate_to**), `ess_reminder_sends`, ✅ **`reminders.scan` cron job** (every 5 min via Vercel cron → drains queue), email via MailRelay. `src/lib/reminders/*`.
- **Enhancements:** ❌ Seed Birch **reminder configs** (3.6); 🟡 confirm escalation routes to Staff/Admin; 🟡 verify MailRelay sender domain for Birch (`@birchfoundation.org.au`).
- **Journey:** 30 days before a volunteer's Blue Card expires → email to volunteer; if overdue → weekly email + escalate to Staff.

### 4.11 Recertification Workflow
- **Spec:** auto-assign recert training on expiry; track history; Board/regulatory reports.
- **Current:** ✅ `ess_recertifications`, ✅ **`recert.scan` cron job**, recert page, history. `src/lib/recertification/*`.
- **Enhancements:** 🟡 on expiry, **auto-assign the linked training module + re-open the cert upload step** (close the loop to training + onboarding); 🟡 recert report for the Board.
- **Journey:** First Aid expires → recert record created → volunteer auto-assigned First Aid refresh + prompted to re-upload → profile shows "recertifying".

### 4.12 Website Portal Integration
- **Spec:** secure login via website footer, email auth; access training/certs/docs/updates; link mini-CRM ↔ ESS.
- **Current:** ✅ email/password login portal. `src/app/login`.
- **Enhancements:** ❌ Add a **"Volunteer Login" link in the birchfoundation.org.au footer** → `saas-ess.vercel.app/login` (or a `portal.birchfoundation.org.au` custom domain — recommended for trust); 🟡 optional **magic-link / "login with email"** to match "email-based authentication"; 🟡 define the **mini-CRM ↔ ESS** linkage (the website volunteer registration form could create a *pending* profile via an API — see §8).
- **Journey:** Volunteer clicks "Volunteer Portal" in the site footer → logs in with email → sees their training, certs, documents, announcements.

### 4.13 Quiz Administrative Interface
- **Spec:** staff create/edit/duplicate/delete quizzes, no developer needed.
- **Current:** ✅ quizzes CRUD + **duplicate** (`/api/quizzes/[id]/duplicate`), grading queue. `src/app/dashboard/quizzes/*`.
- **Enhancements:** 🟡 UX polish for non-technical staff; ensure consistent app shell (done — route layout).

### 4.14 Certification Expiry Management
- **Spec:** set expiry, auto-calc from completion date; visual indicators for upcoming/overdue in profiles + dashboards.
- **Current:** ✅ completion_date + expiry_date stored, cert_types.validity_months, status calc job. 🟡 **auto-calc expiry = completion + validity_months** — fields exist; confirm/enforce auto-fill on create.
- **Enhancements:** 🟡 enforce auto-calc; ❌ **visual indicators** (green/amber/red badges) on the **profile** and **people dashboard** (Certs column → status chips); ❌ a dashboard "compliance health" tile.

---

## 5. End-to-end journeys

### 5.1 Volunteer onboarding ("Sarah", Street Outreach)
1. Sarah registers on birchfoundation.org.au. Admin → **People → Add person** → program **Street Outreach** → login + temp password emailed; **Street Outreach onboarding template** instantiates her checklist.
2. Sarah logs in (footer link) → **My Onboarding**: a progress bar + typed steps.
3. She works them — each **auto-completes**: signs Volunteer Agreement/Code of Conduct/Confidentiality/Photo consent (e-sign → PDF on profile); uploads Police Check, Blue Card, First Aid+CPR with expiry (→ Compliance register); completes Induction + Safeguarding + DV training and passes quizzes (→ training tracking). Staff ticks "Induction meeting".
4. Status rolls **not_started → in_progress → completed**. Only when complete is she **cleared for rostering**.
5. **Ongoing:** her CPR (12-mo) nears expiry → reminder at 60/30/7/0 → if lapsed, **recertification** re-assigns CPR refresh + re-upload; profile shows the gap until resolved.

### 5.2 Admin / Staff
Add volunteers; configure onboarding templates, cert types, documents, training, reminders; watch the **People dashboard** (status + compliance chips), the **Compliance register** (expiring/overdue by program), and **Training reports**; export Board-ready compliance docs; send targeted comms.

### 5.3 Compliance lifecycle
`upload cert (+expiry) → register → status (valid/expiring/overdue) → reminders → escalation → recertification → updated cert` — continuously, per volunteer, auditable.

---

## 6. Data-model & technical enhancements

**P0 — Typed, linked onboarding steps (the keystone).**
- Add to `ess_onboarding_steps` (and the template definition): `step_type` (`profile_field | doc_sign | doc_ack | certification | training | manual`), `ref_kind` + `ref_id` (the linked document_id / cert_type_id / training module_id), `auto_complete` (bool).
- **Auto-completion wiring:** on e-sign event / cert insert / training-module completion, find the volunteer's matching step (by type + ref_id) → mark done → `advanceOnboarding()`.
- **Onboarding templates** become first-class: `ess_onboarding_templates` rows per program with an ordered typed-step list; assign by **program/role** at profile creation.

**P0 — Per-volunteer profile page** (`/dashboard/people/[id]`): tabs Overview · Onboarding · Documents · Certifications · Training · Activity. New `GET /api/people/[id]` (admin/staff) aggregating these.

**P1 — Richer profile fields** in create/edit (phone, emergency contact, program, photo) — DB columns already exist on `ess_employees`.

**P1 — Compliance visual indicators**: status chips (green/amber/red) on profile + people list; "needs follow-up" filter.

**P1 — People list pagination/sort** (250-user scale).

**P2 — Website footer login link + (optional) magic-link auth + custom domain `portal.birchfoundation.org.au`.**

**P2 — Mini-CRM ↔ ESS**: an intake endpoint so the website volunteer form creates a *pending* profile (admin approves → onboarding starts).

---

## 7. Build backlog (prioritised)

| # | Item | Module(s) | Priority | Status today |
|---|---|---|---|---|
| 1 | Typed/linked onboarding steps + auto-complete wiring | Profiles, Onboarding, E-sign, Compliance, Training | **P0** | ❌ |
| 2 | Onboarding **templates per program** + assign on create | Profiles/Onboarding | **P0** | ❌ (generic only) |
| 3 | Per-volunteer **profile detail page** (tabs) | Profiles | **P0** | ❌ |
| 4 | Seed Birch master data (§3: certs, docs, training, templates, reminders, comms) | All | **P0** | ❌ |
| 5 | Compliance **visual indicators** + register view by program | Compliance, Cert Expiry | P1 | 🟡 |
| 6 | Richer profile fields (phone, emergency contact, program, photo) | Profiles | P1 | 🟡 |
| 7 | Reports: filter by program + visual progress + follow-up view | Reporting | P1 | 🟡 |
| 8 | Reminders: seed configs + escalation + Birch sender domain | Reminders | P1 | 🟡 |
| 9 | Recert closes the loop (auto-assign training + re-open cert step) | Recertification | P1 | 🟡 |
| 10 | People list pagination/sort (250 scale) | Profiles | P1 | 🟡 |
| 11 | Comms: target by program group + seed templates + cleanup test announcements | Communications | P1 | 🟡 |
| 12 | Website footer login link + magic-link + custom domain | Portal Integration | P2 | ❌ |
| 13 | Website form → pending-profile intake (mini-CRM link) | Portal Integration | P2 | ❌ |

**Already solid (mostly config-only):** E-signatures, Quiz engine, Quiz admin interface, Training content mgmt, Training tracking — these need **Birch content/seed**, not core build.

---

## 8. Open decisions for Birch

1. **Super Admin vs Admin** — do you need two distinct admin tiers, or is one "Admin" enough? (Recommend: one `admin` tier = Super Admin; restrict Settings/module-config to the org owner if a split is wanted.)
2. **Per-role required checks** — confirm the §3.5 matrix (esp. who needs Blue Card vs Police-only; First Aid mandatory for outreach?).
3. **Cert validity periods** — confirm §3.2 (Police 3y, Blue Card 3y, First Aid 3y, CPR 1y, Food Safety 5y).
4. **Email sender** — verify `@birchfoundation.org.au` sending domain in MailRelay for reminders/comms.
5. **Portal URL** — use `saas-ess.vercel.app` or a branded `portal.birchfoundation.org.au`?
6. **Website intake** — should the public volunteer form auto-create pending profiles, or stay manual?
7. **Magic-link login** — keep email+password, or add passwordless email login?

---

*This blueprint is the source of truth for building Birch's ESS. P0 items (typed onboarding + templates + profile page + seed data) turn the portal from generic scaffolding into Birch's real volunteer onboarding & compliance system.*
