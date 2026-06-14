-- 060_recert_repeatable.sql — make recertification repeatable (spec feature #11)
--
-- Migration 057 declared `unique (certification_id)` on ess_recertifications,
-- which permits only ONE recert row per certification for all time. Once a recert
-- is completed, a new cycle can never open for the same certification.
--
-- Fix: replace the absolute unique constraint with a PARTIAL unique index that
-- enforces "at most one OPEN recert per certification" while allowing new cycles
-- after prior ones are closed. The open set matches migration 057's status CHECK
-- constraint: status in ('assigned', 'in_progress', 'completed') → open = the
-- first two. 'completed' rows are excluded from the index so they never block a
-- fresh cycle.
--
-- Additive + reversible. Does NOT edit migration 057.

-- 057 created the constraint as `unique (certification_id)`; Postgres names it
-- ess_recertifications_certification_id_key by convention. Drop it idempotently.
alter table public.ess_recertifications
  drop constraint if exists ess_recertifications_certification_id_key;

-- One OPEN recert per certification; closed ('completed') cycles do not count,
-- so a new recert can open after the previous one completes.
create unique index if not exists uq_ess_recertifications_open_per_cert
  on public.ess_recertifications (certification_id)
  where status in ('assigned', 'in_progress');
