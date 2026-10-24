-- =====================================================================
-- VitalNest · migration 006 — AI summaries of uploaded reports
-- ai_summary = { "en": {...}, "ta": {...} } — made once per language, reused by the whole family.
-- Run once in Supabase → SQL Editor (safe to re-run).
-- =====================================================================
alter table reports add column if not exists ai_summary jsonb;
select 'ok' as migration_006;
