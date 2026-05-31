# MERGE_NOTES — Phase 1 (Tenant Configuration)

Branch: `feature/phase-1-tenant-config`. Merges **second** (right after Phase 0).
Phase 1 owns the coordination files; later phases only **append** to them.

## 1. Coordination files established (all phases depend on these)

### `src/types/roles.ts` — final MODULE_IDS (DO NOT re-edit in later phases)
```
leave, expense, timesheets, documents, appraisals, contracts, team_calendar,   // existing
profiles, documents_esign, communications, training, quizzes, training_tracking,
reporting, compliance, expiry_reminders, recertification                       // Phase 2-7
```
- `team_calendar` was already present pre-Phase-1 and is **preserved**.
- Added `MODULE_DEPENDENCIES` (code constant, the source of truth):
  `recertification → [training, compliance]`, `quizzes → [training]`,
  `training_tracking → [training]`, `expiry_reminders → [compliance]`.
- Added `ROLE_DISPLAY` + `roleDisplayLabel()`. **CONFIRMED role display mapping:**
  `admin→Admin`, `hr→Staff`, `manager→Staff`, `employee→Volunteer`,
  `super_admin→Super Admin`. Underlying role VALUES unchanged; `super_admin` is the
  `is_super_admin` flag, keyed separately (not a `UserRole`).

### `src/config/navigation.ts` — created with all phase markers
- Import markers: `// === PHASE-2 NAV ===` … `// === PHASE-7 NAV ===`
  (PHASE-2 line reads `// === PHASE-2 NAV (insert import above this line) ===`).
- Entry markers in `navRegistry`: `// PHASE-2 ENTRIES` … `// PHASE-7 ENTRIES`.
- Each later phase: create `src/config/nav/phase-<N>-<slug>.nav.tsx` exporting
  `NavSection[]`; add ONE import under its `// === PHASE-N NAV ===` marker and ONE
  spread under its `// PHASE-N ENTRIES` comment. Different marker per phase → no conflict.
- `src/config/nav/types.ts` — `NavItem` / `NavSection` / `NavVisibilityExtras`.
- `src/config/nav/core.nav.tsx` — pre-Phase-1 nav migrated verbatim (parity).
- `src/config/nav/filter.ts` — pure visibility predicates (module + role + custom).
- `src/components/layout/sidebar.tsx` — **refactored ONCE** to render from `navRegistry`.
  Look/behavior preserved (collapse, expand, sub-items, icons, descriptions,
  active highlight, leave-approval gating, footer/logout/platform link).
  **No later phase edits sidebar.tsx.**

### `src/app/api/modules/route.ts` — module access (Phase 1 owns changes here)
- `GET` unchanged shape (`{ modules_enabled }`). Added `PUT` (admin) for single
  toggles with dependency enforcement (409 on illegal toggle).
- Module state still lives in `ess_companies.settings.modules_enabled` (JSON array) —
  shape unchanged.

## 2. Published contracts (consume by import; do not re-implement)
- `@/lib/modules`: `assertModuleEnabled(companyId, moduleId)` (throws
  `ModuleDisabledError`), `getEnabledModules`, and re-exports of the pure graph
  helpers. The pure dependency-graph logic (`assertToggleAllowed`,
  `validateModuleSet`, `missingDependenciesForEnable`, `dependentsBlockingDisable`,
  `ModuleDependencyError`) lives in `@/lib/modules-deps` (NO Supabase import) so it
  is client- and test-safe; `@/lib/modules` re-exports it. Runtime callers can use
  either path.
- `@/lib/labels` (server): `getLabels(companyId)`, `getLabelFn(companyId)`.
  Pure helpers in `@/lib/labels/resolve` (`resolveLabels`, `makeLabelFn`) and
  defaults/keys in `@/lib/labels/defaults` (`TERM_KEYS`, `DEFAULT_LABELS`, `isTermKey`).
- `@/hooks/use-labels` (client): `useLabels()` → `{ labels, loading, t(key,{plural}) }`
  (fetch-once + module-level cache, like `useModules`). Backed by `GET /api/labels`.
- Term keys: `person`, `supervisor`, `org_unit`, `certification`,
  `training_module`, `document`.
- `ess_tenant_labels` table (see below).

## 3. Migrations added (block 016–019)
- **`016_tenant_terminology.sql`** — creates `ess_tenant_labels`:
  `(id uuid pk, company_id uuid fk→ess_companies on delete cascade, term_key text,
   singular text, plural text, created_at, updated_at, UNIQUE(company_id, term_key))`
  + index `idx_ess_tenant_labels_company`. Ships RLS (`tenant_isolation`,
  `current_company_id() OR is_super_admin()`).
- **`017_module_config.sql`** — intentional no-op (`SELECT 1;`). Documents the
  decision that module dependencies are a CODE constant (`MODULE_DEPENDENCIES`),
  not a table. Reserves the number.
- `018`, `019` — reserved (not used).

## 4. RLS / cross-phase dependency
- `016`'s RLS uses `public.current_company_id()` and `public.is_super_admin()`.
  These helpers are **Phase 0's** (`006_rls_tenant_isolation.sql`), which is NOT in
  this worktree. This is a by-contract dependency per _SHARED_CONVENTIONS §6.3 — it
  resolves once Phase 0 merges first (the documented merge order). No stub needed:
  app routes use `supabaseAdmin` (service role) and scope by `companyId` in code.

## 5. STUBS to delete before merge
- **`src/lib/audit.ts`** — `-- DELETE BEFORE MERGE`. Minimal best-effort
  `recordAudit()` writing to `ess_audit_log` (Phase 0 owns the real helper + table).
  Never throws; safe no-op if the table is absent. After Phase 0 merges, delete this
  file and re-point the two importers below to Phase 0's `recordAudit`:
  - `src/app/api/platform/tenants/[id]/route.ts` (records `modules.updated`)
  - `src/app/api/platform/tenants/[id]/labels/route.ts` (records `terminology.updated`)

## 6. Other files added/changed (within Phase 1 namespace)
- API: `src/app/api/labels/route.ts` (GET resolved labels for current company);
  `src/app/api/platform/tenants/[id]/labels/route.ts` (super-admin GET/PUT overrides).
- Platform UI: `src/components/platform/terminology-panel.tsx` mounted in
  `src/app/platform/tenants/[id]/page.tsx`; that page's Modules card now uses the
  full `MODULE_IDS` list + a client-side dependency cascade (`applyModuleToggle`).
- `src/app/api/platform/tenants/[id]/route.ts` PUT now validates `modules_enabled`
  against the dependency graph (`validateModuleSet`) → 409 on inconsistency.
- `src/services/platform.ts` — added `getTenantLabels` / `updateTenantLabel` +
  `TenantLabelOverride` type.
- `src/components/settings/settings-form.tsx` — tenant admin module list made
  resilient to the expanded `MODULE_IDS` (partial label map + humanized fallback).
- Seed: `scripts/seed-phase-1.ts` (Birch labels + modules; idempotent; slug
  `birch-foundation`). **Not run live.**
- Tests: `src/__tests__/lib/modules.test.ts`, `src/__tests__/lib/labels.test.ts`,
  `src/__tests__/config/navigation.test.ts`, `src/__tests__/types/role-display.test.ts`.

## 7. Dependencies added to package.json
- **None.** (No new runtime/dev deps.)

## 8. Build / test status
- `tsc --noEmit`: clean for all Phase-1 code. Two PRE-EXISTING errors remain on the
  base branch and are unrelated to Phase 1:
  `src/__tests__/integration/api-test-runner.ts` (TS2300 duplicate `test`),
  `src/__tests__/services/timesheet.test.ts` (TS2353 `entry_mode`).
- `eslint` on all Phase-1 files: clean (0 issues). `next lint` exits 0 (warnings only;
  any stale-cache line numbers do not reflect current files).
- `jest`: 8/9 suites pass (71 passing). The one failing suite,
  `api-test-runner.ts`, fails identically on the base branch (pre-existing).
  Phase 1's 4 new suites: 40 tests, all passing.

## 9. Acceptance criteria
- [x] Enabling a module with unmet deps is blocked with a clear message (PUT 409;
      `assertToggleAllowed`; unit-tested).
- [x] Disabling a module blocked while a dependent is on (unit-tested).
- [x] Disabled modules: nav hidden (registry filter) + `assertModuleEnabled` 403 guard.
- [x] Sidebar renders identically to before for existing modules, now via registry
      (parity test + verbatim core.nav migration).
- [x] Terminology resolver: unknown tenant → defaults; override applies; plural works.
- [x] Platform admin can edit per-tenant terminology (Terminology panel) and modules.
