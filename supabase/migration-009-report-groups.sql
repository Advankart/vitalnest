-- VitalNest · migration 009 — one report can hold many files (e.g. several videos of one scan)
-- attachments = [{ "path": "...", "name": "...", "mime": "video/mp4", "size": 123 }]
alter table reports add column if not exists attachments jsonb;
select 'ok' as migration_009;
