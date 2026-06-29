-- Diff-mode checkpoint provenance (diff-style-checkpoint-entry)
--
-- Store the raw `+`/`-` delta text a brewer typed when a checkpoint was entered
-- in diff-mode. Additive and nullable: full-paste checkpoints and every existing
-- row keep delta_text = null, and step-to-step diffs are still derived from
-- adjacent snapshots — this column is provenance only, never re-parsed on read.
-- No backfill.

alter table path_steps add column delta_text text;
