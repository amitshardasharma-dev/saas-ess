# Phase 7 — Reporting, Communications, Reminders, Recertification & Portal

> **Self-contained build doc.** Read `_SHARED_CONVENTIONS.md` first. Migration block:
> **`055`–`064`**. Brief modules: 9 (Training Reporting), 4 (Communications),
> 12 (Expiry Reminders), 13 (Recertification), 14 (Portal Integration).
> Merges **last** — it consumes data + infra from all prior phases (by contract).

---

## 1. Mission
The capstone phase that turns the data and infrastructure from Phases 0–6 into outcomes:
1. **Training reporting dashboard** — all users' progress; filters; CSV/Excel export; stats.
2. **Internal communications** — memos/announcements, rich text, reusable templates,
   targeted delivery (role/org unit/training group/individual), in-portal inbox + audit.
3. **Automated expiry reminders** — configurable timing/content/frequency, auto-escalation.
4. **Recertification workflow** — auto-assign recert training on expiry, history, audit,
   Board/regulatory compliance reports.
5. **Website portal integration** — footer-linkable login, volunteer portal home, mini-CRM
   ↔ ESS cross-navigation.

## 2. Owned files / namespace
- `src/app/dashboard/reports/**`, `src/app/dashboard/communications/**`,
  `src/app/dashboard/recertification/**` (new)
- `src/components/reports/**`, `src/components/communications/**` (new)
- `src/app/api/reports/**`, `src/app/api/communications/**`, `src/app/api/templates/**`,
  `src/app/api/reminders/**`, `src/app/api/recertification/**` (new)
- `src/services/{reports,communications,reminders,recertification}.ts`, matching `src/types/*`
- `src/lib/export/**` (CSV/Excel; coordinate dedupe with Phase 3 — see MERGE_NOTES)
- `src/lib/jobs/handlers.ts` — append reminder + recert handlers under `// === PHASE-7 HANDLERS ===`
- `src/config/nav/phase-7-*.nav.tsx` + append PHASE-7 nav markers
- `supabase/migrations/055_*.sql`…`064_*.sql`
- `scripts/seed-phase-7.ts`

## 3. Migrations (block 055–064)
- **`055_communications.sql`** — `ess_messages` (`id, company_id, subject, body_html,
  sender_app_user_id, status, sent_at`), `ess_message_targets` (`message_id, target_type
  check in ('role','org_unit','group','user','all'), target_value`),
  `ess_message_recipients` (`message_id, employee_id, read_at null, dismissed_at null`),
  `ess_message_templates` (`id, company_id, name, subject, body_html`). RLS.
- **`056_reminders.sql`** — `ess_reminder_configs` (`id, company_id, applies_to text check in
  ('certification','contract','custom'), offsets int[] (e.g. {90,30,7,0,-7}), frequency text
  check in ('once','weekly','daily_overdue'), email_subject text, email_body_html text,
  escalate_to text check in ('supervisor','admin','none'), is_active`),
  `ess_reminder_sends` (`id, company_id, reminder_config_id, certification_id null,
  employee_id, offset_sent int, sent_at`) — dedupe guard so a given offset emails once. RLS.
- **`057_recertification.sql`** — `ess_recertifications` (`id, company_id, employee_id,
  certification_id, triggered_at, assigned_module_id null, status text check in
  ('assigned','in_progress','completed'), completed_at null`), `ess_recert_history`
  (parent-scoped). RLS.
- `058`–`064` reserved.

## 4. Work items

### 4.1 Training reporting (brief 9)
- Admin/Staff dashboard of all users' training progress (consume Phase 5
  `GET /api/training/progress` + Phase 6 attempts). Filters: user, org unit, module,
  completion status. Visual stats (Recharts) + **CSV/Excel export** with label-resolved
  headers (Phase 1). Build a reusable `toCsv` / `toXlsx` in `src/lib/export` (dedupe w/ Phase 3).

### 4.2 Communications (brief 4)
- Compose memos/announcements with **rich text** (add an editor dep, e.g.
  `@tiptap/react@^2` + starter-kit, or a lightweight markdown editor — pin in MERGE_NOTES).
- **Reusable templates** (`ess_message_templates`) — create/apply.
- **Targeted delivery**: resolve targets (role/org_unit/training group (Phase 5 groups)/
  individual/all) → `ess_message_recipients`. Recipients see messages in an in-portal
  inbox/banner (extend the existing announcement banner concept, do not edit platform
  announcements). Optionally also email via Phase 0 `sendEmail`. Audit who-sent-what-to-whom.

### 4.3 Expiry reminders (brief 12) — uses Phase 0 cron + email, Phase 3 cert data
- `ess_reminder_configs` admin UI (timing offsets, content/tone, frequency, escalation).
- Register job handler `reminders.scan` (Phase 0 registry, PHASE-7 marker), run daily by the
  existing `/api/cron/run-jobs`: for each active config, find certs (Phase 3
  `ess_certifications` + `calcStatus`/`daysUntil` from `@/lib/compliance/expiry`) hitting a
  configured offset, send templated email via Phase 0 `sendEmail()` (MailRelay; label-resolved
  subject/body), record in `ess_reminder_sends` (dedupe per offset), and **escalate** to
  supervisor/admin for overdue per config.

### 4.4 Recertification (brief 13) — uses Phase 3 + Phase 5
- Job handler `recert.scan`: when a cert expires, create `ess_recertifications`, auto-assign
  the mapped recert training module (Phase 5 assignment), notify the volunteer, write
  `ess_recert_history` + audit. Track through to completion (Phase 5 module complete →
  mark recert completed → optionally renew the cert / prompt new cert upload).
- **Compliance reports for the Board**: a report combining cert status + recert history,
  exportable (reuse §4.1 export).

### 4.5 Portal integration (brief 14)
- A **footer-linkable** login entry (a clean public route/anchor the marketing site can link).
- Volunteer **portal home** aggregating training, certifications, documents, and
  organizational updates (messages) — a dashboard composition reusing prior phases' widgets.
- **Mini-CRM ↔ ESS** cross-navigation / shared identity: document the integration seam
  (shared auth/email-based identity); implement cross-links where the CRM exists. If the CRM
  is out of repo, expose a documented deep-link contract + shared-login note.

## 5. Contracts PUBLISHED
- `ess_messages*`, `ess_reminder_*`, `ess_recertifications`/`ess_recert_history`.
- Reusable export utils in `@/lib/export`.
- Reminder + recert job handlers (registered in Phase 0 job registry).

## 6. Contracts CONSUMED (stub if needed)
- Phase 0: `sendEmail`, `enqueueJob` + job registry/handlers markers, cron `/api/cron/run-jobs`,
  `recordAudit`, baseline schema.
- Phase 1: `useLabels`/`getLabels`, nav markers, `MODULE_IDS` (`reporting`, `communications`,
  `expiry_reminders`, `recertification`), `assertModuleEnabled` + deps.
- Phase 3: `ess_certifications`, `@/lib/compliance/expiry`, cert reminder_offsets.
- Phase 5: `ess_training_*`, `resolveAssignees`, training groups, progress API.
- Phase 6: `ess_quiz_attempts` (for reporting).
Stub any not-yet-merged upstream tables minimally (mark DELETE BEFORE MERGE).

## 7. Tests
- Reporting filters + export produce correct scoped rows with resolved headers.
- Targeted message delivery resolves the right recipient set per target type; inbox shows it.
- Reminder scan: a cert at exactly a configured offset emails once (dedupe holds on re-run);
  overdue escalates.
- Recert scan: an expired cert creates a recert + assigns the mapped module; completing the
  module marks recert complete.
- Cross-tenant RLS denial on all new tables.

## 8. Seed (`scripts/seed-phase-7.ts`)
- A reminder config (90/30/7/0 offsets, weekly, escalate to supervisor) for First Aid/CPR;
  a message template; a recert mapping (First Aid expiry → First Aid refresher module).

## 9. Acceptance criteria
- [ ] Board-ready training + compliance reports export to CSV/Excel with tenant labels.
- [ ] Staff sends a rich-text memo from a template to a targeted group; recipients see it.
- [ ] An expiring cert triggers a scheduled reminder email; overdue escalates.
- [ ] An expired cert auto-assigns recert training; completing it closes the recert loop.
- [ ] Volunteer reaches the portal home from a website-footer link.
- [ ] RLS + tests pass; `pnpm build` passes.

## 10. MERGE_NOTES
Migrations 055(+); PHASE-7 nav + job-handler marker appends; rich-text editor dep chosen;
export-util dedupe decision vs Phase 3; mini-CRM integration seam status.
