-- =====================================================================
-- VitalNest · migration 003 — medicine photos, diet preference, AI insight cache
-- Run once in Supabase → SQL Editor (safe to re-run).
-- =====================================================================

-- Photo of the tablet / strip (stored in the private "reports" bucket under <patient_id>/meds/…)
alter table medicines add column if not exists photo_path text;

-- Food preference for AI menu suggestions: veg | egg | nonveg | jain
alter table patients add column if not exists diet_pref text;

-- AI results cached per person per day, shared by the whole family (saves AI cost)
create table if not exists ai_cache (
  patient_id uuid not null references patients(id) on delete cascade,
  kind text not null,
  day date not null,
  sig text,
  content jsonb not null,
  created_at timestamptz not null default now(),
  primary key (patient_id, kind, day)
);
alter table ai_cache enable row level security;   -- no policies: server only
