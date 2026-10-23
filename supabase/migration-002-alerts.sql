-- =====================================================================
-- VitalNest · migration 002 — photo-scan fields, family push alerts, missed-medicine alerts
-- Run once in Supabase → SQL Editor (safe to re-run).
-- =====================================================================

-- Medicine details read from photos
alter table medicines add column if not exists composition text;
alter table medicines add column if not exists manufacturer text;

-- Family time zone (for "dose is late" checks) and per-reading notification flag
alter table families add column if not exists timezone text not null default 'Asia/Kolkata';
alter table vitals   add column if not exists notified boolean not null default false;

-- ---------- Device push tokens ----------------------------------------
create table if not exists push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token text not null unique,
  platform text not null check (platform in ('android','web')),
  alerts_vitals boolean not null default true,
  alerts_meds boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table push_tokens enable row level security;
drop policy if exists push_tokens_own on push_tokens;
create policy push_tokens_own on push_tokens for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- A phone can move between logins, so registration goes through this function
create or replace function register_push_token(tok text, plat text, av boolean default true, am boolean default true)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  insert into push_tokens(user_id, token, platform, alerts_vitals, alerts_meds, updated_at)
  values (auth.uid(), tok, plat, av, am, now())
  on conflict (token) do update set user_id = auth.uid(), platform = excluded.platform,
    alerts_vitals = excluded.alerts_vitals, alerts_meds = excluded.alerts_meds, updated_at = now();
end $$;
create or replace function unregister_push_token(tok text)
returns void language sql security definer set search_path = public as $$
  delete from push_tokens where token = tok and user_id = auth.uid();
$$;
grant execute on function register_push_token(text, text, boolean, boolean) to authenticated;
grant execute on function unregister_push_token(text) to authenticated;

-- ---------- Missed-medicine detection ---------------------------------
create table if not exists med_alerts_sent (
  medicine_id uuid not null references medicines(id) on delete cascade,
  scheduled_date date not null,
  scheduled_time text not null,
  sent_at timestamptz not null default now(),
  primary key (medicine_id, scheduled_date, scheduled_time)
);
alter table med_alerts_sent enable row level security;   -- no policies: server only

-- Doses that are 30 min – 3 h late today and not marked taken (and not yet announced)
create or replace function missed_doses_due()
returns table(medicine_id uuid, patient_id uuid, family_id uuid, linked_user_id uuid, patient_name text,
              med_name text, strength text, dose text, scheduled_date date, scheduled_time text)
language sql stable security definer set search_path = public as $$
  with fam as (select f.id, (now() at time zone f.timezone) as lnow from families f)
  select m.id, m.patient_id, p.family_id, p.linked_user_id, p.full_name,
         m.name, m.strength, m.dose, fam.lnow::date, t
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

-- ---------- Server calls: new reading → /api/notify ; every 10 min → /api/missed-meds
create extension if not exists pg_net with schema extensions;

create or replace function notify_new_vital() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform net.http_post(
    url := 'https://vitalnest.vercel.app/api/notify',
    body := jsonb_build_object('vital_id', new.id),
    headers := '{"Content-Type":"application/json"}'::jsonb);
  return new;
exception when others then
  return new;   -- never block saving a reading
end $$;
drop trigger if exists vitals_notify on vitals;
create trigger vitals_notify after insert on vitals for each row execute function notify_new_vital();

create extension if not exists pg_cron;
do $$ begin
  perform cron.unschedule('vitalnest-missed-meds');
exception when others then null;
end $$;
select cron.schedule('vitalnest-missed-meds', '*/10 * * * *',
  $cron$ select net.http_post(url := 'https://vitalnest.vercel.app/api/missed-meds', body := '{}'::jsonb, headers := '{"Content-Type":"application/json"}'::jsonb) $cron$);
