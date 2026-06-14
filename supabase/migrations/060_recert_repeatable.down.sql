-- 060_recert_repeatable.down.sql — reverse 060_recert_repeatable.sql
--
-- Drops the partial open-only unique index and restores the original
-- `unique (certification_id)` constraint from migration 057.
--
-- NOTE: restoring the absolute unique constraint will FAIL if any certification
-- currently has more than one recert row (which the repeatable feature allows).
-- That is expected: the DOWN can only succeed against data that pre-dates the
-- repeatable behaviour.

drop index if exists public.uq_ess_recertifications_open_per_cert;

alter table public.ess_recertifications
  add constraint ess_recertifications_certification_id_key
  unique (certification_id);
