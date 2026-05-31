# Phase 3 — Compliance & Certification Engine

> **Self-contained build doc.** Read `_SHARED_CONVENTIONS.md` first. Migration block:
> **`025`–`029`**. Brief modules: 10 (Compliance Register), 11 (Cert Expiry Management),
> and the data side of 12 (reminders are built in Phase 7 using this data).

---

## 1. Mission
The core charity-compliance value. Generalize the existing **contract expiry pattern**
into a full certification/compliance register:
1. Central **register** of compliance docs & certifications per user (police checks, first
   aid/CPR, etc.) — any cert type.
2. **Auto-calculate expiry** from completion date per cert type's validity period.
3. **Visual indicators** (green/amber/red) in profiles + admin dashboards; upcoming/overdue
   surfaced proactively.
4. **Compliance reporting** — compliant / expiring / overdue, exportable.
5. **Audit trail** of compliance records (reuse contract-history pattern).

## 2. Reuse note
Model on `ess_contracts` / `ess_contract_types` / `ess_contract_history` (migration 003)
and the `days_until_expiry` calc + green/amber/red indicator already used in
`src/app/api/contracts/route.ts` and the contracts UI. Copy that shape; do not modify the
contracts code itself.

## 3. Owned files / namespace
- `src/app/dashboard/compliance/**` (new), `src/app/dashboard/certifications/**` (new)
- `src/components/compliance/**` (new)
- `src/app/api/certifications/**`, `src/app/api/cert-types/**`, `src/app/api/compliance/**` (new)
- `src/services/compliance.ts`, `src/types/compliance.ts` (new)
- `src/lib/compliance/expiry.ts` (new — shared expiry/status calc; Phase 7 imports it)
- `src/config/nav/phase-3-compliance.nav.tsx` + append PHASE-3 nav markers
- `supabase/migrations/025_*.sql`…`029_*.sql`
- `scripts/seed-phase-3.ts`

## 4. Migrations (block 025–029)
- **`025_cert_types.sql`** — `ess_cert_types` — `id, company_id, name, validity_months int
  null (null = never expires), requires_file boolean, reminder_offsets int[] default
  '{90,30,7}', created_at`. RLS.
- **`026_certifications.sql`** — `ess_certifications` — `id, company_id, employee_id,
  cert_type_id, title, status text check in ('valid','expiring','expired','pending'),
  completion_date date, expiry_date date null, file_url text, file_name text,
  created_by, created_at, updated_at`. Indexes on `(company_id)`, `(employee_id)`,
  `(expiry_date)`, `(status)`. RLS.
- **`027_cert_history.sql`** — `ess_certification_history` — parent-scoped child of
  `ess_certifications` (`certification_id`, `action` check in
  `('created','renewed','expired','revoked','recertified')`, `action_date`, `performed_by`,
  `notes`). RLS via parent.
- `028`–`029` reserved.

## 5. Work items
- **Expiry engine** (`src/lib/compliance/expiry.ts`):
  - `calcExpiry(completionDate, validityMonths)`, `calcStatus(expiryDate, today)` →
    `valid|expiring|expired` (amber window default 30 days; configurable), `daysUntil()`.
  - PUBLISH these — Phase 7 reminders import them; Phase 2 profile widget imports `calcStatus`.
- **Register CRUD** (`/api/certifications`): list (scopes `my`/`team`/`all` like contracts),
  create (auto-set `expiry_date` from cert type validity), update, delete; file upload to
  Supabase Storage bucket `certifications` (private; signed URLs — mirror Phase 4 storage
  conventions or contracts file handling). Every mutation writes `ess_certification_history`
  and calls `recordAudit` (Phase 0).
- **Cert types admin** (`/api/cert-types`, Staff/Admin) — define validity + default reminder
  offsets per type.
- **Indicators**: green/amber/red badges in profile + a Staff/Admin compliance dashboard
  (`/dashboard/compliance`) showing per-user status, with "expiring soon" and "overdue"
  sections surfaced at the top.
- **Compliance reporting**: a filtered view (by user, org unit, cert type, status) with
  **CSV/Excel export** (use the Phase 1 label resolver for headers). Export util can be
  shared with Phase 7 — put a reusable `toCsv(rows, headers)` in `src/lib/export/csv.ts`
  (Phase 7 may also create one; coordinate via MERGE_NOTES — first to merge wins, second
  deletes its dup).
- **Onboarding hook**: after a required cert is added/renewed, call Phase 2
  `advanceOnboarding(employeeId)` (contract; guard if absent).
- **Recurring status refresh**: register a job handler `compliance.refresh-status` (Phase 0
  job registry, `// === PHASE-3 HANDLERS ===` marker) that recomputes `status` daily so
  `valid→expiring→expired` transitions happen even with no user action.

## 6. Contracts PUBLISHED
- `ess_cert_types`, `ess_certifications`, `ess_certification_history`.
- `@/lib/compliance/expiry`: `calcExpiry`, `calcStatus`, `daysUntil`.
- `GET /api/certifications?scope=&employee_id=`, status enum, reminder_offsets on cert type
  (Phase 7 reminders read these).

## 7. Contracts CONSUMED (stub if needed)
- Phase 0: Storage conventions, `recordAudit`, job registry + handler markers, baseline schema.
- Phase 1: `useLabels`, nav markers, `MODULE_IDS` (`compliance`), `assertModuleEnabled`.
- Phase 2: `advanceOnboarding` (optional, guard).

## 8. Tests
- `calcExpiry`/`calcStatus` unit tests (boundary: exactly at amber threshold, exactly expired).
- Cross-tenant RLS denial on certifications + history.
- Create cert with a 12-month type → expiry = completion + 12mo, status valid; fast-forward
  → expiring → expired (drive `calcStatus` with injected "today").
- Compliance export returns correct scoped rows with resolved headers.

## 9. Seed (`scripts/seed-phase-3.ts`)
- Cert types: Police Check (validity 36mo), First Aid/CPR (validity 12mo), Working w/
  Children (validity 36mo). Several volunteers with a mix of valid/expiring/expired certs.

## 10. Acceptance criteria
- [ ] Add a police check with completion date → expiry auto-set, green/amber/red shows on
      profile and compliance dashboard.
- [ ] Expiring/overdue certs surface proactively to Staff/Admin.
- [ ] Compliance report exports CSV with tenant-resolved headers and correct scoping.
- [ ] Daily status-refresh job transitions statuses. RLS + tests pass; `pnpm build` passes.

## 11. MERGE_NOTES
Migrations 025(+); PHASE-3 nav + job-handler marker appends; whether you created
`src/lib/export/csv.ts` (dedupe with Phase 7); storage bucket `certifications` created.
