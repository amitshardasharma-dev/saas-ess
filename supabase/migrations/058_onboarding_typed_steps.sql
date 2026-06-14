-- 058_onboarding_typed_steps.sql  (UP)
-- Typed/linked onboarding steps: let a step reference a real artifact (document,
-- cert type, training module) so completing the real action auto-completes the
-- matching step. Additive + backfilled — existing rows become step_type='manual'.
--
-- DOWN migration: 058_onboarding_typed_steps.down.sql

alter table ess_onboarding_steps
  add column if not exists step_type text not null default 'manual',
  add column if not exists ref_kind text,
  add column if not exists ref_id uuid,
  add column if not exists auto_complete boolean not null default false;

-- Constrain step_type to the known set (drop-and-add so re-runs are idempotent).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'ess_onboarding_steps_step_type_chk'
  ) then
    alter table ess_onboarding_steps
      add constraint ess_onboarding_steps_step_type_chk
      check (step_type in ('profile_field','doc_sign','doc_ack','certification','training','manual'));
  end if;
end $$;

-- Index the linkage so the auto-complete lookup (employee_id + step_type + ref_id)
-- is cheap.
create index if not exists ess_onboarding_steps_ref_idx
  on ess_onboarding_steps (employee_id, step_type, ref_id);

-- Existing rows are already manual via the column default; nothing to backfill.
