# MVP Requirements — Charity Volunteer & Compliance Portal

**Date:** 2026-05-31
**Status:** Draft for review
**Context:** Built on the existing multi-tenant ESS platform (Next.js + Supabase).
The charity is the first tenant. The platform is designed so the same product can
be re-pointed at "Employees," "Members," etc. for future tenants by changing
configuration only — no code or schema changes.

**Scope rule:** Every feature in the customer brief is **in scope for MVP**.
Nothing from the brief is deferred. Items that are "industry standard" and
required to make a brief feature actually work are included as supporting
requirements.

**Source tags used throughout:**
- **[Have]** — already built in the current platform
- **[Enhance]** — exists but needs extending/relabeling
- **[New]** — net-new build

---

## Module 0 — Multi-Tenancy & Platform Configuration *(foundation)*

The layer that lets one deployment serve the charity now and other organizations
later, each isolated and individually configured by the platform (super) admin.

### 0.1 Tenancy & isolation
- [Have] Each organization is an isolated tenant; every record carries a tenant ID.
- [Have] Single shared app/database serves all tenants.
- [Enhance] **Database-level isolation (RLS)** so a coding mistake cannot leak data across tenants. *(Security must-have before go-live — see `docs/security/`.)*
- [New] Support **up to 250 concurrent users** per tenant without degradation.

### 0.2 Platform-admin: per-tenant MODULE ACCESS *(your requirement #1)*
- [Have] Tenant settings already carry an enabled-modules list driving navigation.
- [Enhance] Platform admin can **enable/disable each module per tenant** (Profiles, Documents/E-Sign, Communications, Training, Quizzes, Training Tracking, Reporting, Compliance Register, Expiry Reminders, Recertification).
- [New] **Module dependencies enforced** (e.g. Recertification requires Training + Compliance; Quizzes require Training).
- [Enhance] Disabled modules disappear cleanly — hidden in nav, routes refuse access.

### 0.3 Platform-admin: per-tenant NAMING / TERMINOLOGY *(your requirement #2)*
- [New] Platform admin can **rename core concepts per tenant**, display-only, with no data/schema change:
  - the "person" → Volunteer / Employee / Member / Staff
  - the "supervisor" → Coordinator / Manager / Supervisor
  - the "org unit" → Program / Department / Site
  - "Certification", "Training Module", "Document" → tenant's preferred wording
- [New] Each term has **singular + plural** forms and **sensible defaults** (tenant works out-of-the-box).
- [New] Labels apply **everywhere** — screens, buttons, navigation, **emails, reports, CSV headers, PDF documents**.

### 0.4 Tenant provisioning & lifecycle
- [Have] Onboarding wizard: org details → first admin user → plan & modules.
- [Have] Suspend / reactivate / soft-delete a tenant.
- [Have] Per-tenant branding: company name (+ logo/primary color applied to portal, login, emails, reports).

### 0.5 Platform oversight
- [Have] Platform dashboard: total tenants, users, usage, over-limit alerts.
- [Have] Per-tenant usage tracking and admin impersonation for support.
- [New] **Audit log of platform-admin actions** (tenant create/suspend, module/label changes, impersonation) — important for a compliance product.

---

## Module 1 — User Profile Management

> *Brief: comprehensive profiles, onboarding workflow, document tracking, central dashboard, 250 users.*

- [Have] Create, edit, view, deactivate user profiles.
- [Have] Centralized admin dashboard listing all user records, searchable/filterable.
- [Have] Profile holds personal details, contact info, role, org unit.
- [Enhance] **Onboarding workflow with status** per user — a defined sequence (e.g. Invited → Documents Pending → Training Pending → Active) visible on the profile and dashboard.
- [Enhance] **Document tracking on the profile** — which required documents are outstanding / completed / signed, and which certifications are current / expiring / expired.
- [New] **Onboarding checklist** per user showing required steps and completion state.
- [Have] Support up to **250 users** per tenant.

---

## Module 2 — Role-Based Access Control (RBAC)

> *Brief: 4 tiers — Super Admin, Admin, Staff, Volunteer.*

- [Enhance] **Four roles**, relabeled from the existing system:
  - **Super Admin** — full system view, edit, configuration (platform level)
  - **Admin** — full tenant view, edit, configuration
  - **Staff** — administrative functions + volunteer oversight
  - **Volunteer** — own profile, documents, training
- [Have] Every screen and API route **gated by role**; users only see/modify what their role permits.
- [Have] Role assigned per user within a tenant.
- [New] Role names follow the **per-tenant naming** config (Volunteer label can change to Employee, etc.).

---

## Module 3 — Document Completion & E-Signatures

> *Brief: in-portal completion + digital signature, secure storage linked to profile, version control, audit trail.*

- [Have] Document library with categories, search, view/download.
- [Have] **Version control** per document; **acknowledgment** ("I have read & understood") recorded with timestamp.
- [New] **In-portal document completion** — volunteer fills required fields within the portal (no print/scan).
- [New] **Digital signature capture** — typed-name and/or drawn signature, bound to the document with timestamp and signer identity.
- [New] **Signed documents stored securely and linked to the individual's profile.**
- [Have/Enhance] **Audit trail** — who signed what, which version, when, from where (IP/time).

---

## Module 4 — Internal Communications System

> *Brief: memos/announcements, templates, rich text, targeted to groups or individuals, internal only.*

- [Enhance] **Compose and send memos/announcements** within the tenant (internal staff & volunteer network only).
- [New] **Rich-text formatting** in messages.
- [New] **Reusable templates** for common communications.
- [New] **Targeted delivery** — to specific groups (by role, org unit, training group) or named individuals.
- [Enhance] Recipients see announcements in-portal (banner/inbox); audit of what was sent to whom.

---

## Module 5 — Training Content Management

> *Brief: upload/link videos & documents, host on YouTube/Vimeo/etc., organize into modules, assign to groups.*

- [New] **Upload documents** and **link videos** via external URL (YouTube, Vimeo, others).
- [New] **Organize content into training modules** (a module = ordered set of videos/documents/quizzes).
- [New] **Assign modules to user groups** (by role, org unit, or custom group).
- [New] Volunteers see their **assigned modules** with progress and what remains.

---

## Module 6 — Quiz & Assessment Engine

> *Brief: fully customizable; MC (single/multi), True/False, short answer, essay/long-form; passing score, attempt limits, randomization, time limits, feedback timing, answer explanations.*

- [New] **Question types (all required):**
  - Multiple choice — single answer
  - Multiple choice — multiple answers
  - True / False
  - Short answer (text)
  - **Essay / long-form** (with **manual grading** workflow for staff)
- [New] **Configuration options (all required):**
  - Passing score
  - Attempt limit
  - Question randomization
  - **Time limit**
  - **Feedback timing** (immediately / after submission / after close)
  - Answer explanations
- [New] Auto-grading for objective types; **manual-grade queue** for essay/short-answer.
- [New] Quiz attached to a training module; pass/fail feeds training completion.

---

## Module 7 — Quiz Administrative Interface

> *Brief: staff create/edit/duplicate/delete quizzes without technical knowledge; no developer needed.*

- [New] **No-code quiz builder** — create, edit, **duplicate**, delete quizzes via UI.
- [New] Manage questions, answers, scoring, and all config options from the interface.
- [New] Usable by **Staff** role without developer intervention.

---

## Module 8 — Automated Training Tracking

> *Brief: video watch acknowledgement, document download/ack, quiz attempts/scores/pass-fail, module % complete, time spent per component, full history.*

- [New] Track **video watch completion acknowledgement**.
- [New] Track **document download + acknowledgement**.
- [New] Track **quiz attempts, scores, pass/fail**.
- [New] Compute **overall module completion %** per volunteer.
- [New] Track **time spent on each component**.
- [New] **Historical record** of all training activity per volunteer.
- [New] Volunteer sees own progress; no manual record-keeping.

---

## Module 9 — Training Reporting Dashboard

> *Brief: admin view of all progress, filter by user/department/module/status, export CSV/Excel, visual indicators & stats.*

- [New] Admin view of **all users' training progress**.
- [New] **Filters:** by user, org unit/department, training module, completion status.
- [New] **Export to CSV / Excel.**
- [New] **Visual progress indicators** and completion statistics (for Board/compliance reporting).

---

## Module 10 — Compliance Document Register

> *Brief: central register of policies/procedures/compliance docs, auto expiry tracking (police checks, first aid/CPR, etc.), compliance reporting + audit trail.*

- [Enhance] **Central register** of compliance documents and certifications per user (built on the existing contracts/expiry pattern).
- [Enhance] **Automatic expiry tracking** for any cert type (police check, first aid/CPR, etc.).
- [New] **Compliance reporting** — who is compliant / expiring / overdue, exportable.
- [Have/Enhance] **Audit trail** of compliance records and changes.

---

## Module 11 — Certification Expiry Management

> *Brief: set expiry dates with auto-calc from completion date, visual indicators for upcoming/overdue in profiles & dashboards.*

- [Enhance] **Auto-calculate expiry** from completion date (per cert type's validity period).
- [Enhance] **Visual indicators** (e.g. green / amber / red) in **user profiles and admin dashboards** — reuses the existing contract-expiry indicator pattern.
- [New] Upcoming and overdue certifications surfaced proactively to admins.

---

## Module 12 — Automated Expiry Reminders

> *Brief: configurable timing (90/30/7/on/after expiry), customizable email content & tone, configurable frequency (one-time/weekly/daily overdue), auto-escalation to supervisors/admins.*

- [New] **Configurable reminder timing** — multiple offsets before expiry, on expiry, and after expiry.
- [New] **Customizable email content and tone** per reminder.
- [New] **Configurable frequency** — one-time, weekly, or daily for overdue items.
- [New] **Automatic escalation** to supervisor/admin for overdue items.
- [New] **Supporting infrastructure:** scheduled job runner + email delivery provider.

---

## Module 13 — Recertification Workflow

> *Brief: auto-assign recert training on expiry, track recert history + audit trail, generate Board/regulatory compliance reports.*

- [New] **Auto-assign recertification training** when a certification expires.
- [New] **Track recertification history** per user.
- [New] **Maintain compliance audit trail** across cert → expiry → recert.
- [New] **Generate compliance reports** for the Board and regulatory needs.

---

## Module 14 — Website Portal Integration

> *Brief: secure login via website footer, email-based auth, access to training/certs/documents/updates, mini-CRM ↔ ESS linking.*

- [Have] **Email-based authentication.**
- [New] **Login entry point linkable from the organization's website footer.**
- [Have/Enhance] Volunteer portal home giving access to **training records, certifications, document repository, and organizational updates**.
- [New] **Internal linking between the mini-CRM and the ESS portal** (cross-navigation / shared identity).

---

## Cross-cutting MVP essentials (apply to all modules)

- [Enhance] **Per-tenant labels** resolved consistently across every module's UI, emails, and exports.
- [Enhance] **Role-based access** enforced on every new module's screens and routes.
- [Enhance] **Tenant isolation (RLS)** extended to all new tables.
- [New] **Email delivery + scheduled jobs** infrastructure (shared by reminders, recertification, communications).
- [Standard] **Audit trails** on documents, signatures, compliance, and training records.

---

## Build-weight summary

| Weight | Modules | Why |
|--------|---------|-----|
| **Heavy (new subsystems)** | 5–9 (LMS: training, quiz, tracking, reporting, quiz admin) | Net-new, largest surface; essay grading + time limits add complexity |
| **Heavy (new automation)** | 12–13 (reminders, recertification) | Needs scheduled jobs + email provider |
| **Medium (extend existing)** | 3 (e-sign), 4 (comms), 10–11 (compliance/expiry) | Build on existing document/contract patterns |
| **Light (relabel/config)** | 0 (config), 1 (profiles), 2 (RBAC), 14 (portal) | Mostly Have/Enhance |

---

## Open confirmations (do not block the requirements, but shape the build)

1. **E-signature defensibility** — typed-name/drawn + timestamp + audit (planned) vs. cryptographically bound (DocuSign-style)?
2. **Essay grading** — confirm staff manual-grading workflow is acceptable for MVP (it's the only way to grade free text).
3. **Email provider** — preference (e.g. Resend, AWS SES) for reminders/communications.
4. **Mini-CRM** — what system is it, and what does "internal linking" mean (single sign-on, deep links, shared records)?
