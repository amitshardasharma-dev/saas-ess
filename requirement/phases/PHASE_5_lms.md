# Phase 5 — LMS: Training Content Management + Automated Tracking

> **Self-contained build doc.** Read `_SHARED_CONVENTIONS.md` first. Migration block:
> **`035`–`044`**. Brief modules: 5 (Training Content), 8 (Automated Tracking).
> **Largest net-new subsystem.** Phase 6 (quizzes) depends on this by contract.

---

## 1. Mission
1. **Content management** — upload documents + link external videos (YouTube/Vimeo/other).
2. **Training modules** — an ordered set of items (videos / documents / quizzes).
3. **Assignment** — assign modules to groups (by role, org unit, or custom group).
4. **Volunteer learning view** — assigned modules, progress, what remains.
5. **Automated tracking** — video watch ack, document download+ack, quiz attempts/scores/
   pass-fail (from Phase 6), module % complete, **time spent per component**, full history.

## 2. Owned files / namespace
- `src/app/dashboard/training/**` (volunteer + manage) (new)
- `src/components/training/**` (new — module player, video embed, progress)
- `src/app/api/training/**` (modules, items, assignments, progress, tracking) (new)
- `src/services/training.ts`, `src/types/training.ts` (new)
- `src/lib/training/**` (new — completion calc; PUBLISH for Phases 6/7)
- `src/config/nav/phase-5-training.nav.tsx` + append PHASE-5 nav markers
- `supabase/migrations/035_*.sql`…`044_*.sql`
- `scripts/seed-phase-5.ts`

## 3. Migrations (block 035–044)
- **`035_training_content.sql`**:
  - `ess_training_modules` — `id, company_id, title, description, status text check in
    ('draft','published','archived'), created_by, created_at, updated_at`.
  - `ess_training_items` — ordered items: `id, company_id, module_id, type text check in
    ('video','document','quiz'), title, video_url text null, video_provider text null,
    document_id uuid null, quiz_id uuid null, required boolean, sort_order`.
    (`quiz_id` references Phase 6's `ess_quizzes` — keep as a plain uuid column, no FK, to
    avoid a hard cross-phase dependency; document this.)
- **`036_training_groups.sql`**:
  - `ess_training_groups` — custom groups: `id, company_id, name, criteria jsonb null
    (e.g. {role:'employee'} or {org_unit:'X'})`.
  - `ess_training_group_members` — `id, company_id, group_id, employee_id`.
  - `ess_training_assignments` — `id, company_id, module_id, target_type text check in
    ('role','org_unit','group','user'), target_value text, assigned_at, due_at null`.
- **`037_training_tracking.sql`**:
  - `ess_training_progress` — per (employee, module): `id, company_id, employee_id,
    module_id, percent_complete numeric, status text check in
    ('not_started','in_progress','complete'), started_at, completed_at`. Unique
    `(employee_id, module_id)`.
  - `ess_training_item_progress` — per (employee, item): `id, company_id, employee_id,
    item_id, status text check in ('not_started','in_progress','complete'),
    acknowledged boolean, time_spent_seconds int default 0, last_event_at, completed_at`.
    Unique `(employee_id, item_id)`.
  - `ess_training_events` — append-only history: `id, company_id, employee_id, item_id null,
    module_id, event text (e.g. 'video_watched','doc_downloaded','doc_acknowledged',
    'quiz_passed','quiz_failed','time_tick'), meta jsonb, created_at`.
- RLS on every table (direct `company_id`). `038`–`044` reserved.

## 4. Work items
- **Content/module builder** (Staff/Admin): create modules, add/reorder items (video URL +
  provider detect, link existing document, attach a quiz by id), publish/archive.
- **Video embedding**: parse YouTube/Vimeo URLs into embeds; "mark watched" acknowledgement
  (no DRM/real watch enforcement required for MVP — acknowledgement + time-on-component).
- **Assignment engine**: resolve assignments → the set of employees who must do a module
  (`resolveAssignees(moduleId)`), via role/org_unit/group/user. Volunteers see assigned
  modules only.
- **Volunteer learning view**: list assigned modules with `percent_complete`, per-item
  status, and "what remains"; a module player that walks items in order.
- **Tracking**:
  - Video item → "I watched this" sets item complete + `video_watched` event.
  - Document item → download + acknowledge (reuse doc acknowledgment concept) → complete.
  - Quiz item → consumes Phase 6 result (pass → complete). Provide a published function
    `recordQuizResult(employeeId, itemId, passed, score)` that Phase 6 calls.
  - **Time spent**: client sends periodic `time_tick` (e.g. every 15s of active view);
    accumulate into `time_spent_seconds`. Throttle + cap server-side.
  - **Module % complete**: `recomputeModuleProgress(employeeId, moduleId)` = required items
    complete / total required. On 100% → status complete, `completed_at`, write event, and
    call Phase 2 `advanceOnboarding` (guard) + Phase 3/7 recert hooks if applicable.
- **History**: all events queryable per volunteer (feeds Phase 7 reporting).

## 5. Contracts PUBLISHED
- All `ess_training_*` tables (names/columns above).
- `@/lib/training`: `resolveAssignees(moduleId)`, `recomputeModuleProgress(employeeId,
  moduleId)`, `recordQuizResult(employeeId, itemId, passed, score)`.
- `ess_training_items.quiz_id` is the join point for Phase 6.
- Progress/event read APIs for Phase 7 reporting:
  `GET /api/training/progress?scope=&employee_id=&module_id=`.

## 6. Contracts CONSUMED (stub if needed)
- Phase 0: baseline schema, `recordAudit`, job registry (for nightly progress recompute).
- Phase 1: `useLabels` (terms `training_module`), nav markers, `MODULE_IDS`
  (`training`, `training_tracking`), `assertModuleEnabled`, module deps.
- Phase 2: `advanceOnboarding` (optional). Phase 6: `ess_quizzes` id (referenced loosely).
- Existing documents module for document items.

## 7. Tests
- Assignment resolution for each target type returns correct employees (tenant-scoped).
- Module % complete = required-complete / required-total; ignores optional items.
- Time-tick accumulation caps and throttles; events recorded.
- `recordQuizResult` pass marks the quiz item + recomputes module progress.
- Cross-tenant RLS denial on modules, progress, events.

## 8. Seed (`scripts/seed-phase-5.ts`)
- A "Volunteer Induction" module (a Vimeo video + a policy document + a quiz placeholder id),
  assigned to all volunteers; one volunteer mid-way through.

## 9. Acceptance criteria
- [ ] Staff builds a module (video + doc + quiz), publishes, assigns to volunteers.
- [ ] Volunteer sees assigned module, completes items, progress % updates, time tracked.
- [ ] Quiz pass (via Phase 6 contract / stub) marks the item complete.
- [ ] Full per-volunteer history available. RLS + tests pass; `pnpm build` passes.

## 10. MERGE_NOTES
Migrations 035(+); PHASE-5 nav append; that `ess_training_items.quiz_id` is FK-less by
design; `recordQuizResult` signature (Phase 6 must match); any onboarding/recert hooks.
