create schema if not exists app_private;
revoke all on schema app_private from public;
grant usage on schema app_private to authenticated;

create table public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '审核人员',
  role text not null default 'auditor' check (role in ('auditor', 'admin', 'rule_maintainer')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.user_profiles enable row level security;

create function app_private.current_role()
returns text language sql stable security definer set search_path = '' as $$
  select role from public.user_profiles
  where id = (select auth.uid()) and active = true
$$;
revoke all on function app_private.current_role() from public;
grant execute on function app_private.current_role() to authenticated;

create policy profiles_read on public.user_profiles for select to authenticated
  using (id = (select auth.uid()) or app_private.current_role() = 'admin');
create policy profiles_admin_update on public.user_profiles for update to authenticated
  using (app_private.current_role() = 'admin')
  with check (app_private.current_role() = 'admin');
grant select, update on public.user_profiles to authenticated;

create function app_private.initialize_profile()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.user_profiles(id, display_name, role)
  values (new.id, coalesce(nullif(split_part(new.email, '@', 1), ''), '审核人员'), 'auditor');
  return new;
end;
$$;
revoke all on function app_private.initialize_profile() from public;
create trigger on_certiscope_user_created after insert on auth.users
  for each row execute function app_private.initialize_profile();

create table public.operation_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references auth.users(id),
  event_type text not null check (event_type in (
    'upload', 'review_start', 'review_failure', 'manual_correction',
    'recalculate', 'confirmation', 'opinion_submit', 'return',
    'assignment', 'rule_upgrade', 'export', 'archive', 'rule_publish'
  )),
  success boolean not null,
  task_id uuid,
  round_id uuid,
  object_id uuid,
  version_id uuid,
  error_code text,
  created_at timestamptz not null default now()
);
create index operation_events_task_time on public.operation_events(task_id, created_at desc);
alter table public.operation_events enable row level security;
create policy operation_events_insert on public.operation_events for insert to authenticated
  with check (actor_id = (select auth.uid()) and app_private.current_role() is not null);
create policy operation_events_read on public.operation_events for select to authenticated
  using (actor_id = (select auth.uid()) or app_private.current_role() = 'admin');
grant select, insert on public.operation_events to authenticated;
