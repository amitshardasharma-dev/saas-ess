# Phase 7 — Merge Notes (Reporting, Communications, Reminders, Recertification, Portal)

Branch: `feature/phase-7-reporting` (off `feature/multi-tenant-hr-system`, base HEAD 3b6b461).
All code + typecheck only. No DB/seed/deploy was run.

## Migrations added (block 055–064)
- `supabase/migrations/055_communications.sql` — `ess_messages`, `ess_message_targets`
  (child, parent-scoped RLS), `ess_message_recipients`, `ess_message_templates`. RLS in
  the same migration for every table (direct-`company_id` `tenant_isolation`, or
  parent-scoped via `exists(... ess_messages ...)` for `ess_message_targets`).
- `supabase/migrations/056_reminders.sql` — `ess_reminder_configs`, `ess_reminder_sends`
  with a dedupe `unique (reminder_config_id, certification_id, offset_sent)`. RLS in-file.
- `supabase/migrations/057_recertification.sql` — `ess_recertifications`
  (`unique (certification_id)` for idempotent recert.scan), `ess_recert_history`
  (child, parent-scoped RLS). RLS in-file.
- 058–064 reserved/unused.

No STUB migrations were needed — all upstream tables this phase reads
(`ess_certifications`, `ess_cert_types`, `ess_employees`, `ess_app_users`,
`ess_training_*`, `ess_companies`, `ess_jobs`, `ess_audit_log`) already exist in the
merged base. Phase 6 `ess_quiz_attempts` is read defensively (see below).

## Coordination-file appends (append-only protocol honored)
- `src/config/navigation.ts`:
  - ONE import under `// === PHASE-7 NAV ===`:
    `import { phase7ReportingNav } from './nav/phase-7-reporting.nav'`
  - ONE spread under `// PHASE-7 ENTRIES`: `...phase7ReportingNav,`
  - Nav export name: **`phase7ReportingNav`** (file
    `src/config/nav/phase-7-reporting.nav.tsx`). Sections: reporting (order 70),
    communications (71), expiry_reminders (72), recertification (73).
- `src/lib/jobs/handlers.ts`:
  - Two imports added at top (scanReminders, scanRecertifications).
  - Two handlers appended **under** `// === PHASE-7 HANDLERS ===` ONLY:
    `'reminders.scan'` and `'recert.scan'` (both no-op when `job.company_id` is null).
- `src/types/roles.ts` — NOT edited (module ids `reporting`, `communications`,
  `expiry_reminders`, `recertification` already present from Phase 1).
- `package.json` — NOT edited. **No new dependencies added** (see rich-text choice).

## Rich-text editor choice
No editor dependency added. The compose page uses a **Markdown textarea + live HTML
preview** rendered by a tiny dependency-free converter `src/lib/communications/markdown.ts`
(escapes input first, then whitelists headings/bold/italic/code/links/lists). The brief
explicitly permits "a lightweight markdown editor". This keeps `package.json` untouched
and the merge surface clean. If a WYSIWYG is later desired, swap to `@tiptap/react@^2` +
`@tiptap/starter-kit@^2` behind the same `mdToHtml`/`body_html` contract.

## Export-util dedupe decision (vs Phase 3)
Phase 3 already ships `src/lib/export/csv.ts` (`toCsv`). Phase 7 **reuses** it and does
NOT duplicate it. Phase 7 adds `src/lib/export/index.ts` which re-exports `toCsv`/`CsvCell`
and adds: typed `ExportColumn`/`buildMatrix`/`rowsToCsv`, a dependency-free
SpreadsheetML 2003 `toXlsx` (Excel opens natively as `.xls`), and `buildExport` for HTTP
download bodies. No npm dependency required for "Excel" export. At merge there is no
conflict: `csv.ts` is untouched; `index.ts` is new and Phase-7-owned.

## Quiz-attempts guard (Phase 6 by-contract gap)
Phase 6 is parallel and NOT in this worktree. `src/lib/reports/training.ts` reads
`ess_quiz_attempts` inside a `safeSelect` try/catch that returns `[]` on any error
(missing table included), and tolerates several plausible column names
(`employee_id|app_user_id`, `module_id|training_module_id`, `score|percentage|percent`).
No quiz tables are created and no quiz modules are imported at top level. If Phase 6's
final attempt-table column names differ, the report still renders (quiz column shows null)
— revisit the column mapping after Phase 6 merges.

## Cross-phase contracts consumed
- Phase 0: `withAuth`, `recordAudit`, `sendEmail`, `enqueueJob`, job registry markers,
  `/api/cron/run-jobs`, `ess_jobs`, `ess_audit_log`.
- Phase 1: nav markers, `ModuleId`s, `useLabels`/label resolver (report export accepts a
  `?labels=` JSON so headers are tenant-label resolvable; UI passes Volunteer/Org Unit).
- Phase 3: `ess_certifications` (`expiry_date`, `cert_type_id`, `status`), `ess_cert_types`
  (recert mapping stored on `settings.recert_module_id`), `@/lib/compliance/expiry`
  (`daysUntil`).
- Phase 5: `ess_training_group_members` (group targeting), `ess_training_tracking`/
  `ess_training_modules` (reporting), `ess_training_assignments` (recert auto-assign,
  best-effort try/catch). `ess_training_tracking` columns read permissively
  (`status`, `progress_pct|progress`, `completed_at`).

## Mini-CRM integration seam (spec §4.5)
The CRM is out of repo. Implemented as a documented deep-link contract:
- Public, footer-linkable entry: `src/app/portal/page.tsx` at route **`/portal`** — the
  stable URL the marketing site links. Routes signed-in users to `/dashboard/portal`,
  others to `/login?redirect=/dashboard/portal`.
- CRM→ESS: link to `${ESS_BASE_URL}/portal` (shared Supabase-Auth, email-based identity).
- ESS→CRM: set `NEXT_PUBLIC_CRM_URL` and a "Open the supporter CRM" link appears on
  `/portal`. No code change needed when the CRM URL is known.

## Files added (new, Phase-7-owned)
- Migrations: 055/056/057 (above).
- Types: `src/types/{communications,reminders,recertification}.ts` (+ colocated Zod).
- Lib: `src/lib/export/index.ts`, `src/lib/communications/{resolve-recipients,markdown}.ts`,
  `src/lib/reminders/scan.ts`, `src/lib/recertification/scan.ts`, `src/lib/reports/training.ts`.
- API: `src/app/api/communications/{route,inbox/route,inbox/[id]/route}.ts`,
  `src/app/api/templates/{route,[id]/route}.ts`,
  `src/app/api/reminders/{route,[id]/route,run/route}.ts`,
  `src/app/api/recertification/route.ts`,
  `src/app/api/reports/{training,compliance}/route.ts`,
  `src/app/api/portal/home/route.ts`.
- UI: `src/app/dashboard/{reports,reports/training,reports/compliance,communications,
  communications/compose,communications/inbox,reminders,recertification,portal}/page.tsx`,
  `src/app/portal/page.tsx`.
- Client svc: `src/services/phase7-client.ts`.
- Nav: `src/config/nav/phase-7-reporting.nav.tsx`.
- Seed: `scripts/seed-phase-7.ts` (idempotent; NOT run).
- Tests: `src/__tests__/phase7-{export,recipients,reminders-logic}.test.ts`.

## Security notes (conventions §6.1)
- Every API route uses `withAuth` and scopes by `companyId`.
- Id-addressed routes re-check ownership and return **404** on cross-tenant:
  `communications/inbox/[id]` (must match caller's employee+company),
  `templates/[id]`, `reminders/[id]`.
- minRole: reports/communications-compose/templates/recert-list = `hr`; reminder configs +
  reminder/run = `admin`; inbox + portal home = `employee`.

## Gates
- `npx tsc --noEmit --pretty false` → **0 errors** (verified; base was 0).
- Jest workers are flaky in this sandbox (env exits 194/empty as warned). Tests are
  written as pure/injected-dependency units (no fetch-client imports, no node-env email
  imports) and pass static review; rely on tsc + review per the task's guidance.
