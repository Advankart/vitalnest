-- =====================================================================
-- VitalNest — Family Health Tracker  ·  Supabase schema
-- Paste this whole file into Supabase → SQL Editor → New query → Run.
-- Safe to re-run: it drops nothing that holds data.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- Families & logins ----------------------------------------
create table if not exists families (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_code text not null unique default upper(substr(md5(random()::text), 1, 6)),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists app_users (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  display_name text,
  created_at timestamptz not null default now()
);

-- role: admin (full control) · caregiver (can add data for everyone) · viewer (read only)
create table if not exists family_members (
  family_id uuid not null references families(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'viewer' check (role in ('admin','caregiver','viewer')),
  joined_at timestamptz not null default now(),
  primary key (family_id, user_id)
);

-- ---------- Patients (the people whose health is tracked) -------------
create table if not exists patients (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  linked_user_id uuid references auth.users(id) on delete set null, -- the person's own login, if any
  full_name text not null,
  relation text,                -- Self, Father, Mother…
  dob date,
  gender text,
  blood_group text,
  height_cm numeric,
  weight_kg numeric,
  phone text,
  condition text not null default 'type2'
    check (condition in ('type1','type2','type2_cardiac','prediabetes','none')),
  diagnosed_year int,
  heart_conditions text,        -- e.g. CAD, stent 2021, heart failure
  other_conditions text,        -- e.g. hypertension, thyroid
  allergies text,
  doctor_name text,
  doctor_phone text,
  hospital text,
  emergency_name text,
  emergency_phone text,
  insulin_regimen text,         -- e.g. basal-bolus, pump
  -- personal targets (sensible defaults, editable)
  target_fasting_min int not null default 80,
  target_fasting_max int not null default 130,
  target_pp_max int not null default 180,
  target_sys_max int not null default 130,
  target_dia_max int not null default 80,
  target_hr_min int not null default 60,
  target_hr_max int not null default 100,
  daily_kcal_goal int not null default 1800,
  daily_water_goal_ml int not null default 2500,
  color text not null default '#0f766e',
  notes text,
  created_at timestamptz not null default now()
);

-- ---------- Logs --------------------------------------------------------
-- kind: glucose · bp · heart_rate · weight · spo2 · temperature · hba1c
create table if not exists vitals (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id) on delete cascade,
  kind text not null check (kind in ('glucose','bp','heart_rate','weight','spo2','temperature','hba1c')),
  value1 numeric not null,      -- glucose mg/dL · systolic · bpm · kg · % · °F · %
  value2 numeric,               -- diastolic (bp)
  value3 numeric,               -- pulse captured with bp
  context text,                 -- fasting · before_meal · after_meal · bedtime · random · night
  notes text,
  measured_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists vitals_patient_time on vitals(patient_id, measured_at desc);

create table if not exists meals (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id) on delete cascade,
  meal_type text not null default 'lunch', -- breakfast · lunch · snack · dinner
  items jsonb not null default '[]',       -- [{name, qty, unit, kcal, carbs, protein}]
  total_kcal numeric not null default 0,
  total_carbs numeric not null default 0,
  total_protein numeric not null default 0,
  notes text,
  eaten_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);
create index if not exists meals_patient_time on meals(patient_id, eaten_at desc);

create table if not exists water_logs (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id) on delete cascade,
  ml int not null check (ml > 0 and ml < 5000),
  logged_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);
create index if not exists water_patient_time on water_logs(patient_id, logged_at desc);

create table if not exists custom_foods (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  name text not null,
  unit text not null default 'serving',
  kcal numeric not null,
  carbs numeric not null default 0,
  protein numeric not null default 0
);

create table if not exists medicines (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id) on delete cascade,
  name text not null,
  strength text,                 -- 500 mg, 10 units
  form text not null default 'tablet', -- tablet · capsule · insulin · syrup · injection · inhaler · other
  dose text,                     -- 1 tablet, 8 units
  food_relation text default 'after_food', -- before_food · after_food · with_food · empty_stomach · any
  times text[] not null default '{}',  -- {'08:00','20:00'}
  days int[] not null default '{0,1,2,3,4,5,6}', -- 0 = Sunday
  start_date date default current_date,
  end_date date,
  stock int,
  purpose text,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists medicine_logs (
  id uuid primary key default gen_random_uuid(),
  medicine_id uuid not null references medicines(id) on delete cascade,
  patient_id uuid not null references patients(id) on delete cascade,
  scheduled_date date not null,
  scheduled_time text not null,
  status text not null default 'taken' check (status in ('taken','skipped')),
  logged_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  unique (medicine_id, scheduled_date, scheduled_time)
);

-- reminders to MEASURE vitals (medicine reminders come from medicines.times)
create table if not exists reminders (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id) on delete cascade,
  kind text not null default 'glucose', -- glucose · bp · heart_rate · weight · water · custom
  label text not null,
  time text not null,                   -- 'HH:MM'
  days int[] not null default '{0,1,2,3,4,5,6}',
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists reports (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id) on delete cascade,
  title text not null,
  category text default 'lab',          -- lab · prescription · scan · discharge · other
  report_date date default current_date,
  file_path text not null,
  file_name text,
  mime_type text,
  size_bytes int,
  notes text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

-- ---------- Helper functions (security definer = bypass RLS safely) ---
create or replace function is_family_member(fid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from family_members where family_id = fid and user_id = auth.uid());
$$;

create or replace function family_role(fid uuid) returns text
language sql stable security definer set search_path = public as $$
  select role from family_members where family_id = fid and user_id = auth.uid();
$$;

create or replace function can_view_patient(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from patients p join family_members m on m.family_id = p.family_id
    where p.id = pid and m.user_id = auth.uid());
$$;

create or replace function can_edit_patient(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from patients p join family_members m on m.family_id = p.family_id
    where p.id = pid and m.user_id = auth.uid()
      and (m.role in ('admin','caregiver') or p.linked_user_id = auth.uid()));
$$;

-- Create a family and become its admin
create or replace function create_family(fname text) returns families
language plpgsql security definer set search_path = public as $$
declare f families;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  insert into families(name, created_by) values (fname, auth.uid()) returning * into f;
  insert into family_members(family_id, user_id, role) values (f.id, auth.uid(), 'admin');
  return f;
end $$;

-- Join a family using its 6-letter invite code (joins as viewer)
create or replace function join_family(code text) returns families
language plpgsql security definer set search_path = public as $$
declare f families;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  select * into f from families where invite_code = upper(trim(code));
  if f.id is null then raise exception 'Invalid invite code'; end if;
  insert into family_members(family_id, user_id, role) values (f.id, auth.uid(), 'viewer')
    on conflict do nothing;
  return f;
end $$;

-- Members list with usernames (for the family screen)
create or replace function family_people(fid uuid)
returns table(user_id uuid, username text, display_name text, role text, joined_at timestamptz)
language sql stable security definer set search_path = public as $$
  select m.user_id, u.username, u.display_name, m.role, m.joined_at
  from family_members m left join app_users u on u.id = m.user_id
  where m.family_id = fid and is_family_member(fid)
  order by m.joined_at;
$$;

-- Username availability check before sign-up
create or replace function username_available(uname text) returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (select 1 from app_users where lower(username) = lower(uname));
$$;
grant execute on function username_available(text) to anon, authenticated;

-- Fill app_users automatically when someone signs up
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into app_users(id, username, display_name)
  values (new.id,
          coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
          new.raw_user_meta_data->>'display_name')
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

-- ---------- Row Level Security ----------------------------------------
alter table families       enable row level security;
alter table app_users      enable row level security;
alter table family_members enable row level security;
alter table patients       enable row level security;
alter table vitals         enable row level security;
alter table meals          enable row level security;
alter table water_logs     enable row level security;
alter table custom_foods   enable row level security;
alter table medicines      enable row level security;
alter table medicine_logs  enable row level security;
alter table reminders      enable row level security;
alter table reports        enable row level security;

do $$ declare r record; begin
  for r in select policyname, tablename from pg_policies where schemaname = 'public' loop
    execute format('drop policy if exists %I on %I', r.policyname, r.tablename);
  end loop;
end $$;

create policy fam_select on families for select using (is_family_member(id));
create policy fam_update on families for update using (family_role(id) = 'admin');

create policy users_select on app_users for select using (
  id = auth.uid() or exists (
    select 1 from family_members a join family_members b on a.family_id = b.family_id
    where a.user_id = auth.uid() and b.user_id = app_users.id));
create policy users_update on app_users for update using (id = auth.uid());

create policy fm_select on family_members for select using (is_family_member(family_id));
create policy fm_update on family_members for update using (family_role(family_id) = 'admin');
create policy fm_delete on family_members for delete using (family_role(family_id) = 'admin' or user_id = auth.uid());

create policy pat_select on patients for select using (is_family_member(family_id));
create policy pat_insert on patients for insert with check (family_role(family_id) in ('admin','caregiver'));
create policy pat_update on patients for update using (can_edit_patient(id));
create policy pat_delete on patients for delete using (family_role(family_id) = 'admin');

create policy cf_all on custom_foods for all
  using (is_family_member(family_id)) with check (family_role(family_id) in ('admin','caregiver') or is_family_member(family_id));

-- Same rule set for every per-patient table
do $$ declare t text; begin
  foreach t in array array['vitals','meals','water_logs','medicines','medicine_logs','reminders','reports'] loop
    execute format('create policy %1$s_sel on %1$s for select using (can_view_patient(patient_id))', t);
    execute format('create policy %1$s_ins on %1$s for insert with check (can_edit_patient(patient_id))', t);
    execute format('create policy %1$s_upd on %1$s for update using (can_edit_patient(patient_id))', t);
    execute format('create policy %1$s_del on %1$s for delete using (can_edit_patient(patient_id))', t);
  end loop;
end $$;

-- ---------- Storage bucket for health reports (private) ---------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('reports', 'reports', false, 20971520)   -- 20 MB per file
on conflict (id) do nothing;

-- Files are stored as  <patient_id>/<timestamp>-<filename>
drop policy if exists reports_read on storage.objects;
drop policy if exists reports_write on storage.objects;
drop policy if exists reports_delete on storage.objects;
create policy reports_read on storage.objects for select
  using (bucket_id = 'reports' and can_view_patient(((storage.foldername(name))[1])::uuid));
create policy reports_write on storage.objects for insert
  with check (bucket_id = 'reports' and can_edit_patient(((storage.foldername(name))[1])::uuid));
create policy reports_delete on storage.objects for delete
  using (bucket_id = 'reports' and can_edit_patient(((storage.foldername(name))[1])::uuid));

-- ---------- Live updates so family screens refresh automatically -----
do $$ begin
  begin alter publication supabase_realtime add table vitals; exception when others then null; end;
  begin alter publication supabase_realtime add table meals; exception when others then null; end;
  begin alter publication supabase_realtime add table water_logs; exception when others then null; end;
  begin alter publication supabase_realtime add table medicine_logs; exception when others then null; end;
end $$;
