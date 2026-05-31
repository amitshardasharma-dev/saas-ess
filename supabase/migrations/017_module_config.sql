-- 017_module_config.sql
-- Phase 1: module access + dependency metadata.
--
-- DECISION (Phase 1 doc §4): module dependencies are encoded as a CODE CONSTANT
-- (MODULE_DEPENDENCIES in src/types/roles.ts), not a table. Enabled modules
-- continue to live in ess_companies.settings.modules_enabled (JSON array) — no
-- schema change is required. This migration is intentionally a no-op placeholder
-- that documents the decision and reserves migration number 017 for Phase 1.
--
-- Migrations 018-019 remain reserved for Phase 1.

-- (no schema changes)
SELECT 1;
