-- 058_onboarding_typed_steps.down.sql  (DOWN — reverses 058 up)
-- Reversible: drops only the columns/constraint/index this migration added.
-- Does NOT delete or rewrite any onboarding rows (data is preserved on re-up
-- via the column default 'manual').

drop index if exists ess_onboarding_steps_ref_idx;

alter table ess_onboarding_steps
  drop constraint if exists ess_onboarding_steps_step_type_chk;

alter table ess_onboarding_steps
  drop column if exists auto_complete,
  drop column if exists ref_id,
  drop column if exists ref_kind,
  drop column if exists step_type;
