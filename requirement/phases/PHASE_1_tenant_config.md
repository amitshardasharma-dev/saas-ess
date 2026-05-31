# Phase 1 — Tenant Configuration: Module Access + Terminology

> **Self-contained build doc.** Read `_SHARED_CONVENTIONS.md` first. Merges **second**
> (right after Phase 0). This phase **owns the coordination files** (`roles.ts`,
> `navigation.ts`, modules route) — it sets up the shared scaffolding all later phases
> append to. Migration block: **`016`–`019`**.
> Brief modules: 0.2 (per-tenant module access), 0.3 (terminology), 2 (naming part).

---

## 1. Mission
Let the platform admin configure each tenant **without code changes**:
1. **Per-tenant module access** extended to all new modules, with **dependency enforcement**.
2. **Per-tenant terminology** — rename core concepts (person → Volunteer/Employee/Member,
   supervisor → Coordinator/Manager, org unit → Program/Department, plus
   Certification/Training Module/Document) with singular+plural and sensible defaults.
3. A **label resolver** used everywhere (UI, emails, exports, PDFs).
4. Refactor the sidebar into a **nav registry** so later phases add navigation without
   merge conflicts.

## 2. Why it's second
Every later phase renders labels and gates on modules. Building the resolver + nav
registry first means Phases 2–7 just consume them. This phase also pre-declares **all
new module IDs** so no other phase needs to edit `roles.ts`.

---

## 3. Owned files / namespace
- `src/types/roles.ts` — **add all new MODULE_IDS + role config** (Section 5.1).
- `src/config/navigation.ts` (new) + `src/config/nav/types.ts` (new) — nav registry.
- `src/components/layout/sidebar.tsx` — **refactor once** to render from registry.
- `src/lib/labels/**` (new) — terminology resolver.
- `src/app/api/modules/route.ts` — module access (you own changes here).
- `src/app/api/platform/tenants/[id]/config/route.ts` (new) — module + label config.
- `src/app/platform/tenants/[id]/**` — config UI additions.
- `supabase/migrations/016_*.sql` … `019_*.sql`
- `scripts/seed-phase-1.ts`

## 4. Migrations (block 016–019)
- **`016_tenant_terminology.sql`** — add `ess_companies.settings.labels` usage is JSON
  (no schema change needed if labels live in `settings`); OR a dedicated
  `ess_tenant_labels` table if you prefer relational. **Decision: use a dedicated table**
  `ess_tenant_labels (id, company_id, term_key text, singular text, plural text)` with a
  unique `(company_id, term_key)` — easier to query for exports. Ship RLS.
- **`017_module_config.sql`** — `ess_module_dependencies` seed table (static dependency
  metadata) OR encode in code. **Decision: code constant** (no migration needed) — so 017
  only adds any columns needed on `ess_companies` (e.g. nothing). Keep block reserved.
- `018`–`019` reserved.

## 5. Work items

### 5.1 `roles.ts` — declare ALL modules + role relabel (do this first)
Extend `MODULE_IDS` with every module the project will use, so no later phase edits this file:
```ts
export const MODULE_IDS = [
  // existing
  'leave','expense','timesheets','documents','appraisals','contracts','team_calendar',
  // new (Birch)
  'profiles','documents_esign','communications','training','quizzes',
  'training_tracking','reporting','compliance','expiry_reminders','recertification',
] as const
```
- Keep underlying `USER_ROLES` (`admin/hr/manager/employee`) + `is_super_admin` unchanged
  (data stays stable). The **display** mapping Admin/Staff/Volunteer/Super Admin is a
  label concern (Section 5.3), not a data change. **CONFIRMED mapping (client decision):**
  - `admin` → **Admin**
  - `hr` → **Staff**
  - `manager` → **Staff**  (hr and manager both surface as the single "Staff" tier)
  - `employee` → **Volunteer**
  - `is_super_admin` → **Super Admin**
  This gives Birch exactly the 4 brief tiers. Where `hasMinRole` logic distinguishes hr vs
  manager internally (e.g. HR-only management screens), that stays as-is at the permission
  layer — only the **displayed role name** collapses to "Staff".

### 5.2 Module access + dependency enforcement (brief 0.2)
- `MODULE_DEPENDENCIES` constant: `recertification → [training, compliance]`,
  `quizzes → [training]`, `training_tracking → [training]`, `expiry_reminders → [compliance]`.
- `GET/PUT /api/modules` (and the platform tenant config route): when enabling a module,
  validate its deps are enabled; when disabling, block if a dependent is on (or cascade with
  confirmation). Return clear errors.
- Disabled modules **disappear cleanly**: nav hidden (registry filter) + routes 403. Provide
  a tiny helper `assertModuleEnabled(companyId, moduleId)` for route guards and export it.

### 5.3 Terminology resolver (brief 0.3) → PUBLISHES `t()` / `useLabels()`
- Defaults per term in `src/lib/labels/defaults.ts` (so a tenant works out of the box).
- Server resolver `getLabels(companyId)` merges defaults + `ess_tenant_labels`.
- Client hook `useLabels()` fetches once (like `useModules`) → `{ t(key, {plural}) }`.
- Term keys: `person`, `supervisor`, `org_unit`, `certification`, `training_module`,
  `document` (extend as needed). Each has singular + plural.
- **Apply everywhere**: provide the resolver to UI, the email service (Phase 0 `sendEmail`
  accepts pre-rendered html — phases render labels before sending), CSV/PDF exporters
  (Phases 7/3 import `getLabels`). Document this in the published contract.

### 5.4 Nav registry refactor (enables conflict-free nav for all phases)
- Create `src/config/nav/types.ts`:
  ```ts
  export interface NavItem { titleKey: string; href: string; icon: string; minRole?: string; descriptionKey?: string }
  export interface NavSection { moduleId: string; titleKey: string; href?: string; icon: string; minRole?: string; items?: NavItem[] }
  ```
- Create `src/config/navigation.ts` with the **phase-delimited markers** exactly as in
  `_SHARED_CONVENTIONS.md` §4.2 (pre-seed PHASE-2…PHASE-7 import + entry markers).
- Migrate the **existing** modules' nav (leave, expense, timesheets, documents, appraisals,
  contracts) into `src/config/nav/core.nav.tsx` and reference from the registry.
- Refactor `sidebar.tsx` to render `navRegistry` filtered by `isModuleEnabled(section.moduleId)`
  + `hasMinRole` + resolve titles via `useLabels()`. Preserve current look/behavior.

### 5.5 Platform config UI (brief 0.2/0.3)
- On `src/app/platform/tenants/[id]/`, add panels: **Modules** (toggle with dependency
  validation) and **Terminology** (edit singular/plural per term, live preview). Writes via
  the platform config route. Record changes to `ess_audit_log` (Phase 0 contract).

## 6. Contracts this phase PUBLISHES
- Final `MODULE_IDS` (all phases use these string ids; never re-edit `roles.ts`).
- `MODULE_DEPENDENCIES` + `assertModuleEnabled(companyId, moduleId)` from `@/lib/modules`.
- Label resolver: `getLabels(companyId)` (server) and `useLabels()` (client) from `@/lib/labels`;
  term keys list above.
- Nav registry: `src/config/navigation.ts` (markers PHASE-2…PHASE-7) + `NavSection`/`NavItem` types.
- `ess_tenant_labels` table.

## 7. Contracts CONSUMED (by contract; stub if needed)
- Phase 0: `ess_companies` baseline schema, `recordAudit`. Stub `ess_audit_log` minimally
  in your worktree if Phase 0 isn't merged yet (mark DELETE BEFORE MERGE).

## 8. Tests
- Module dependency: enabling `quizzes` without `training` is rejected; disabling `training`
  while `quizzes` on is rejected.
- Label resolver: unknown tenant → defaults; overridden term → override; plural form works.
- Nav registry: a disabled module's section is absent; role gate hides higher-role items.
- Snapshot the refactored sidebar to confirm parity with the old one.

## 9. Seed (`scripts/seed-phase-1.ts`)
- Set Birch labels: person→Volunteer, supervisor→Coordinator, org_unit→Program,
  certification→Certification, training_module→Training Module.
- Enable Birch's MVP modules.

## 10. Acceptance criteria
- [ ] Platform admin can rename "Volunteer"→"Member" and it updates UI, an email body, and
      a CSV header (verify with a Phase-7 export once available; until then unit-test the resolver path).
- [ ] Enabling a module with unmet deps is blocked with a clear message.
- [ ] Disabling a module removes its nav and 403s its routes.
- [ ] Sidebar renders identically to before for existing modules, now via the registry.
- [ ] `pnpm build` + tests pass.

## 11. MERGE_NOTES to record
Final MODULE_IDS list; that you created `navigation.ts` with all phase markers; the
role→label mapping decision; migrations 016(+); `ess_tenant_labels` shape.
