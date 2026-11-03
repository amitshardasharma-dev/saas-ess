-- Migration: 071_training_assignment_indexes.sql
-- Description: Restore the indexes from 036_training_groups.sql that never
--   reached production. Production was built from the consolidated
--   `ess_birch_esign_training` migration, which created the three training
--   group/assignment tables without any indexes.
--
-- Without uq_ess_training_assignments, POST /api/training/modules/{id}/assignments
-- fails every time: its upsert uses onConflict 'module_id,target_type,target_value'
-- and Postgres rejects it with "there is no unique or exclusion constraint
-- matching the ON CONFLICT specification" (HTTP 500).
--
-- Index-only change: no rows are modified. If duplicate assignment rows exist,
-- the unique index creation fails and the migration rolls back without changes.

create index if not exists idx_ess_training_groups_company
	on public.ess_training_groups (company_id);

create index if not exists idx_ess_training_group_members_company
	on public.ess_training_group_members (company_id);
create index if not exists idx_ess_training_group_members_group
	on public.ess_training_group_members (group_id);
create unique index if not exists uq_ess_training_group_members
	on public.ess_training_group_members (group_id, employee_id);

create index if not exists idx_ess_training_assignments_company
	on public.ess_training_assignments (company_id);
create index if not exists idx_ess_training_assignments_module
	on public.ess_training_assignments (module_id);
create unique index if not exists uq_ess_training_assignments
	on public.ess_training_assignments (module_id, target_type, target_value);
