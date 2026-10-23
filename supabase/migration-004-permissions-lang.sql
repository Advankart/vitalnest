-- =====================================================================
-- VitalNest · migration 004 — per-person edit rights, notification language
-- Run once in Supabase → SQL Editor (safe to re-run).
-- =====================================================================

-- Who may change a person's health data:
--   • the person themself (profile linked to their login)
--   • a caregiver
--   • an admin — only for profiles NOT linked to another member's login
-- So two admins (e.g. husband & wife, each with their own login) cannot edit each other's data.
create or replace function can_edit_patient(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from patients p join family_members m on m.family_id = p.family_id
    where p.id = pid and m.user_id = auth.uid()
      and (
        p.linked_user_id = auth.uid()
        or m.role = 'caregiver'
        or (m.role = 'admin' and (
              p.linked_user_id is null
              or not exists (select 1 from family_members m2 where m2.family_id = p.family_id and m2.user_id = p.linked_user_id)))
      ));
$$;

-- Deleting a profile follows the same rule (and still needs admin)
drop policy if exists pat_delete on patients;
create policy pat_delete on patients for delete using (family_role(family_id) = 'admin' and can_edit_patient(id));

-- Language for push notifications (en / ta)
alter table push_tokens add column if not exists lang text not null default 'en';
drop function if exists register_push_token(text, text, boolean, boolean);
create or replace function register_push_token(tok text, plat text, av boolean default true, am boolean default true, lng text default 'en')
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  insert into push_tokens(user_id, token, platform, alerts_vitals, alerts_meds, lang, updated_at)
  values (auth.uid(), tok, plat, av, am, coalesce(lng, 'en'), now())
  on conflict (token) do update set user_id = auth.uid(), platform = excluded.platform,
    alerts_vitals = excluded.alerts_vitals, alerts_meds = excluded.alerts_meds, lang = excluded.lang, updated_at = now();
end $$;
grant execute on function register_push_token(text, text, boolean, boolean, text) to authenticated;

select 'ok' as migration_004;
