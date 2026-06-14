-- Down migration: 059_cert_history_preserve.down.sql
-- Re-adds the cascading foreign key exactly as migration 027 defined it.
--
-- CAVEAT: this is only safe if NO orphaned history rows exist (i.e. no
-- ess_certification_history.certification_id points at a now-deleted
-- certification). If any cert has been deleted while 059 was applied, those
-- surviving history rows are dangling references and ADD CONSTRAINT will FAIL
-- with a foreign_key_violation. Resolve such rows (archive/remove) before
-- rolling back. Restoring the cascade also re-arms the original audit-loss bug.

ALTER TABLE ess_certification_history
  ADD CONSTRAINT ess_certification_history_certification_id_fkey
  FOREIGN KEY (certification_id) REFERENCES ess_certifications(id) ON DELETE CASCADE;

COMMENT ON COLUMN ess_certification_history.certification_id IS NULL;
