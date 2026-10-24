-- =====================================================================
-- VitalNest · migration 007 — doctor visits / follow-up tests (with reminders)
-- Dates can come from prescriptions, discharge summaries and other reports, or be added by hand.
-- Run once in Supabase → SQL Editor (safe to re-run).
-- =====================================================================
create table if not exists appointments (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id) on delete cascade,
  title text not null,
  kind text not null default 'visit' check (kind in ('visit', 'test')),
  doctor text,
  hospital text,
  appt_date date not null,
  appt_time text,
  notes text,
  source text not null default 'manual',
  report_id uuid references reports(id) on delete set null,
  done boolean not null default false,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists appointments_patient_date on appointments(patient_id, appt_date);
alter table appointments enable row level security;
drop policy if exists appt_select on appointments;
drop policy if exists appt_insert on appointments;
drop policy if exists appt_update on appointments;
drop policy if exists appt_delete on appointments;
create policy appt_select on appointments for select using (can_view_patient(patient_id));
create policy appt_insert on appointments for insert with check (can_edit_patient(patient_id));
create policy appt_update on appointments for update using (can_edit_patient(patient_id));
create policy appt_delete on appointments for delete using (can_edit_patient(patient_id));

do $$ begin
  alter publication supabase_realtime add table appointments;
exception when others then null;
end $$;

select 'ok' as migration_007;
