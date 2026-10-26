create table public.project_source_files (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  file_name text not null,
  storage_path text not null unique,
  parse_status text not null default 'pending',
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
alter table public.project_source_files enable row level security;
create policy project_source_admin_insert on public.project_source_files for insert to authenticated
  with check (app_private.current_role() = 'admin' and created_by = (select auth.uid()) and exists (select 1 from public.projects where id = project_id));
grant select, insert on public.project_source_files to authenticated;

create table public.project_category_assignments (
  project_id uuid not null references public.projects(id) on delete cascade,
  category_code text not null check (category_code in ('LT','SS','WE','EA','MR','EQ')),
  auditor_id uuid not null references public.user_profiles(id),
  assigned_by uuid not null references auth.users(id),
  assigned_at timestamptz not null default now(),
  primary key (project_id, category_code)
);
alter table public.project_category_assignments enable row level security;
create policy category_assignment_read on public.project_category_assignments for select to authenticated
  using (app_private.current_role() = 'admin' or auditor_id = (select auth.uid()));
create policy category_assignment_admin_insert on public.project_category_assignments for insert to authenticated
  with check (app_private.current_role() = 'admin' and assigned_by = (select auth.uid()));
create policy category_assignment_admin_update on public.project_category_assignments for update to authenticated
  using (app_private.current_role() = 'admin') with check (app_private.current_role() = 'admin' and assigned_by = (select auth.uid()));
grant select, insert, update on public.project_category_assignments to authenticated;

create policy project_source_read on public.project_source_files for select to authenticated
  using (app_private.current_role() = 'admin' or exists (
    select 1 from public.project_category_assignments a
    where a.project_id = project_source_files.project_id and a.auditor_id = (select auth.uid())
  ));

create policy projects_category_read on public.projects for select to authenticated
  using (exists (select 1 from public.project_category_assignments a where a.project_id = projects.id and a.auditor_id = (select auth.uid())));

create policy gv_intake_assigned_read on storage.objects for select to authenticated
  using (bucket_id = 'gv-intake' and exists (
    select 1 from public.project_source_files f
    join public.project_category_assignments a on a.project_id = f.project_id
    where f.storage_path = name and a.auditor_id = (select auth.uid())
  ));
create policy gv_intake_project_admin_read on storage.objects for select to authenticated
  using (bucket_id = 'gv-intake' and app_private.current_role() = 'admin' and exists (
    select 1 from public.project_source_files f where f.storage_path = name
  ));

create function public.assign_project_category(p_project_id uuid, p_category_code text, p_auditor_id uuid)
returns table(task_id uuid, round_id uuid)
language plpgsql security invoker set search_path = '' as $$
declare
  v_task uuid;
  v_round uuid;
begin
  if app_private.current_role() <> 'admin' then raise exception '仅审核管理员可以分配'; end if;
  if p_category_code not in ('LT','SS','WE','EA','MR','EQ') then raise exception '类别无效'; end if;
  if not exists (select 1 from public.projects where id = p_project_id) then raise exception '项目不存在'; end if;
  if not exists (select 1 from public.user_profiles where id = p_auditor_id and role = 'auditor' and active = true) then raise exception '审核员不可用'; end if;
  insert into public.project_category_assignments(project_id, category_code, auditor_id, assigned_by)
    values(p_project_id, p_category_code, p_auditor_id, (select auth.uid()))
    on conflict(project_id, category_code) do update set auditor_id = excluded.auditor_id, assigned_by = excluded.assigned_by, assigned_at = now();
  if p_category_code = 'LT' then
    select id, current_round_id into v_task, v_round from public.gv_tasks where project_id = p_project_id order by created_at limit 1;
    if v_task is null then
      insert into public.gv_tasks(project_id, current_auditor_id, system, system_version, stage, created_by)
        values(p_project_id, p_auditor_id, '待核对', '待核对', '待核对', (select auth.uid())) returning id into v_task;
      insert into public.task_rounds(task_id, sequence) values(v_task, 1) returning id into v_round;
      update public.gv_tasks set current_round_id = v_round where id = v_task;
    else
      update public.gv_tasks set current_auditor_id = p_auditor_id, updated_at = now() where id = v_task;
    end if;
    if not exists (select 1 from public.task_participants participant where participant.task_id = v_task and participant.user_id = p_auditor_id and participant.left_at is null) then
      insert into public.task_participants(task_id, user_id) values(v_task, p_auditor_id);
    end if;
  end if;
  return query select v_task, v_round;
end;
$$;
revoke all on function public.assign_project_category(uuid, text, uuid) from public;
grant execute on function public.assign_project_category(uuid, text, uuid) to authenticated;
