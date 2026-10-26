create table public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  project_type text not null check (length(trim(project_type)) > 0),
  location text not null check (length(trim(location)) > 0),
  area_value numeric not null check (area_value > 0),
  area_unit text not null check (length(trim(area_unit)) > 0),
  target_level text not null check (length(trim(target_level)) > 0),
  intake_file_path text,
  confirmed_by uuid not null references auth.users(id),
  confirmed_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.projects enable row level security;

create table public.gv_tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id),
  current_auditor_id uuid not null references public.user_profiles(id),
  current_round_id uuid,
  system text not null,
  system_version text not null,
  stage text not null,
  incentive_path text check (incentive_path in ('A', 'B')),
  facility_path text check (facility_path in ('C', 'D')),
  rule_version_id uuid,
  archived_at timestamptz,
  archived_by uuid references auth.users(id),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index gv_tasks_auditor_idx on public.gv_tasks(current_auditor_id, archived_at);
alter table public.gv_tasks enable row level security;

create table public.task_rounds (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.gv_tasks(id),
  sequence integer not null check (sequence > 0),
  source text not null default 'initial' check (source in ('initial', 'supplement')),
  status text not null default 'open' check (status in ('open', 'submitted', 'returned', 'archived')),
  rule_version_id uuid,
  selected_material_version_ids uuid[] not null default '{}',
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  unique(task_id, sequence),
  unique(task_id, id)
);
alter table public.task_rounds enable row level security;
alter table public.gv_tasks add constraint gv_tasks_current_round_fk
  foreign key (id, current_round_id) references public.task_rounds(task_id, id) deferrable initially deferred;

create table public.task_participants (
  task_id uuid not null references public.gv_tasks(id),
  user_id uuid not null references public.user_profiles(id),
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  primary key (task_id, user_id, joined_at)
);
create index task_participants_user_idx on public.task_participants(user_id, task_id);
alter table public.task_participants enable row level security;

create table public.project_intake_candidates (
  id uuid primary key default gen_random_uuid(),
  intake_file_path text not null,
  field_key text not null check (field_key in ('name', 'project_type', 'location', 'area', 'target_level')),
  candidate_value text not null,
  source_location jsonb,
  confidence numeric check (confidence between 0 and 1),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
alter table public.project_intake_candidates enable row level security;

create table public.project_create_requests (
  actor_id uuid not null references auth.users(id),
  request_key text not null check (length(request_key) between 1 and 128),
  project_id uuid not null references public.projects(id),
  task_id uuid not null references public.gv_tasks(id),
  round_id uuid not null references public.task_rounds(id),
  created_at timestamptz not null default now(),
  primary key (actor_id, request_key)
);
alter table public.project_create_requests enable row level security;

create policy projects_read on public.projects for select to authenticated
  using (app_private.current_role() = 'admin' or exists (
    select 1 from public.gv_tasks t where t.project_id = projects.id
      and (t.current_auditor_id = (select auth.uid()) or exists (
        select 1 from public.task_participants p where p.task_id = t.id and p.user_id = (select auth.uid())
      ))
  ));
create policy projects_admin_insert on public.projects for insert to authenticated
  with check (app_private.current_role() = 'admin' and created_by = (select auth.uid()));
create policy projects_admin_update on public.projects for update to authenticated
  using (app_private.current_role() = 'admin') with check (app_private.current_role() = 'admin');

create policy tasks_read on public.gv_tasks for select to authenticated
  using (app_private.current_role() = 'admin' or current_auditor_id = (select auth.uid()) or exists (
    select 1 from public.task_participants p where p.task_id = gv_tasks.id and p.user_id = (select auth.uid())
  ));
create policy tasks_admin_insert on public.gv_tasks for insert to authenticated
  with check (app_private.current_role() = 'admin' and created_by = (select auth.uid()));
create policy tasks_admin_update on public.gv_tasks for update to authenticated
  using (app_private.current_role() = 'admin') with check (app_private.current_role() = 'admin');

create policy rounds_read on public.task_rounds for select to authenticated
  using (exists (select 1 from public.gv_tasks t where t.id = task_rounds.task_id));
create policy rounds_admin_insert on public.task_rounds for insert to authenticated
  with check (app_private.current_role() = 'admin');
create policy rounds_admin_update on public.task_rounds for update to authenticated
  using (app_private.current_role() = 'admin') with check (app_private.current_role() = 'admin');
create policy participants_read on public.task_participants for select to authenticated
  using (app_private.current_role() = 'admin' or user_id = (select auth.uid()));
create policy participants_admin_insert on public.task_participants for insert to authenticated
  with check (app_private.current_role() = 'admin');
create policy participants_admin_update on public.task_participants for update to authenticated
  using (app_private.current_role() = 'admin') with check (app_private.current_role() = 'admin');
create policy intake_admin on public.project_intake_candidates for all to authenticated
  using (app_private.current_role() = 'admin')
  with check (app_private.current_role() = 'admin' and created_by = (select auth.uid()));
create policy project_requests_admin on public.project_create_requests for all to authenticated
  using (app_private.current_role() = 'admin' and actor_id = (select auth.uid()))
  with check (app_private.current_role() = 'admin' and actor_id = (select auth.uid()));

grant select, insert, update on public.projects, public.gv_tasks, public.task_rounds, public.task_participants to authenticated;
grant select, insert on public.project_intake_candidates to authenticated;
grant select, insert on public.project_create_requests to authenticated;

create function public.create_gv_project(
  p_name text,
  p_project_type text,
  p_location text,
  p_area_value numeric,
  p_area_unit text,
  p_target_level text,
  p_intake_file_path text,
  p_current_auditor_id uuid,
  p_system text,
  p_system_version text,
  p_stage text,
  p_request_key text
)
returns table(project_id uuid, task_id uuid, round_id uuid)
language plpgsql security invoker set search_path = '' as $$
declare
  new_project_id uuid;
  new_task_id uuid;
  new_round_id uuid;
  existing_request public.project_create_requests%rowtype;
begin
  if app_private.current_role() <> 'admin' then
    raise exception '仅审核管理员可创建项目';
  end if;
  if coalesce(trim(p_name), '') = '' or coalesce(trim(p_project_type), '') = ''
    or coalesce(trim(p_location), '') = '' or p_area_value is null or p_area_value <= 0
    or coalesce(trim(p_area_unit), '') = '' or coalesce(trim(p_target_level), '') = ''
    or coalesce(trim(p_system), '') = '' or coalesce(trim(p_system_version), '') = ''
    or coalesce(trim(p_stage), '') = '' then
    raise exception '项目五项资料及审核范围必须由管理员核对填写';
  end if;
  if not exists (
    select 1 from public.user_profiles
    where id = p_current_auditor_id and role = 'auditor' and active = true
  ) then
    raise exception '必须指定有效审核员';
  end if;
  if coalesce(length(p_request_key), 0) < 1 or length(p_request_key) > 128 then
    raise exception '请求标识无效';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended((select auth.uid())::text || ':' || p_request_key, 0));
  select * into existing_request from public.project_create_requests
    where actor_id = (select auth.uid()) and request_key = p_request_key;
  if found then
    return query select existing_request.project_id, existing_request.task_id, existing_request.round_id;
    return;
  end if;
  if p_intake_file_path is not null and not exists (
    select 1 from storage.objects
    where bucket_id = 'gv-intake' and name = p_intake_file_path
      and split_part(name, '/', 1) = (select auth.uid())::text
  ) then
    raise exception '申报表单原件不存在或无权访问';
  end if;
  insert into public.projects (
    name, project_type, location, area_value, area_unit, target_level,
    intake_file_path, confirmed_by, created_by
  ) values (
    trim(p_name), trim(p_project_type), trim(p_location), p_area_value,
    trim(p_area_unit), trim(p_target_level), p_intake_file_path,
    (select auth.uid()), (select auth.uid())
  ) returning id into new_project_id;
  insert into public.gv_tasks (
    project_id, current_auditor_id, system, system_version, stage, created_by
  ) values (
    new_project_id, p_current_auditor_id, trim(p_system), trim(p_system_version),
    trim(p_stage), (select auth.uid())
  ) returning id into new_task_id;
  insert into public.task_rounds (task_id, sequence)
    values (new_task_id, 1) returning id into new_round_id;
  update public.gv_tasks set current_round_id = new_round_id where id = new_task_id;
  insert into public.task_participants (task_id, user_id)
    values (new_task_id, p_current_auditor_id);
  insert into public.project_create_requests (actor_id, request_key, project_id, task_id, round_id)
    values ((select auth.uid()), p_request_key, new_project_id, new_task_id, new_round_id);
  return query select new_project_id, new_task_id, new_round_id;
end;
$$;
revoke all on function public.create_gv_project(text, text, text, numeric, text, text, text, uuid, text, text, text, text) from public;
grant execute on function public.create_gv_project(text, text, text, numeric, text, text, text, uuid, text, text, text, text) to authenticated;
