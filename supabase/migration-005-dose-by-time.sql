-- =====================================================================
-- VitalNest · migration 005 — different dose at different times
-- e.g. 1 tablet in the morning, 2 tablets at night → dose_by_time = {"08:00":"1 tablet","21:00":"2 tablets"}
-- Run once in Supabase → SQL Editor (safe to re-run).
-- =====================================================================
alter table medicines add column if not exists dose_by_time jsonb;

-- Missed-dose alerts use the dose for that exact time
create or replace function missed_doses_due()
returns table(medicine_id uuid, patient_id uuid, family_id uuid, linked_user_id uuid, patient_name text,
              med_name text, strength text, dose text, scheduled_date date, scheduled_time text)
language sql stable security definer set search_path = public as $$
  with fam as (select f.id, (now() at time zone f.timezone) as lnow from families f)
  select m.id, m.patient_id, p.family_id, p.linked_user_id, p.full_name,
         m.name, m.strength, coalesce(nullif(m.dose_by_time->>t, ''), m.dose), fam.lnow::date, t
  from medicines m
  join patients p on p.id = m.patient_id
  join fam on fam.id = p.family_id
  cross join lateral unnest(m.times) as t
  where m.active
    and m.created_at < now() - interval '1 hour'
    and (m.start_date is null or m.start_date <= fam.lnow::date)
    and (m.end_date   is null or m.end_date   >= fam.lnow::date)
    and extract(dow from fam.lnow)::int = any(m.days)
    and t ~ '^[0-2][0-9]:[0-5][0-9]$'
    and (fam.lnow - interval '3 hours')::date = fam.lnow::date
    and t::time <= (fam.lnow - interval '30 minutes')::time
    and t::time >= (fam.lnow - interval '3 hours')::time
    and not exists (select 1 from medicine_logs l where l.medicine_id = m.id and l.scheduled_date = fam.lnow::date and l.scheduled_time = t)
    and not exists (select 1 from med_alerts_sent a where a.medicine_id = m.id and a.scheduled_date = fam.lnow::date and a.scheduled_time = t);
$$;
revoke execute on function missed_doses_due() from public, anon, authenticated;

select 'ok' as migration_005;
