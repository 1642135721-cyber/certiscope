-- 审核管理员回收站：仅添加可恢复的逻辑删除，不清理审核记录和原始材料。
alter table public.projects add column if not exists deleted_at timestamptz;
alter table public.projects add column if not exists deleted_by uuid references auth.users(id);
alter table public.gv_tasks add column if not exists deleted_at timestamptz;
alter table public.gv_tasks add column if not exists deleted_by uuid references auth.users(id);
create index if not exists projects_active_idx on public.projects(deleted_at, created_at desc);
create index if not exists gv_tasks_active_idx on public.gv_tasks(deleted_at, project_id);

drop policy if exists projects_read on public.projects;
create policy projects_read on public.projects for select to authenticated using (
  app_private.current_role() = 'admin' or
  (deleted_at is null and exists (
    select 1 from public.gv_tasks t where t.project_id = projects.id
      and t.deleted_at is null and
      (t.current_auditor_id = (select auth.uid()) or exists (
        select 1 from public.task_participants p where p.task_id = t.id and p.user_id = (select auth.uid())
      ))
  ))
);
drop policy if exists projects_category_read on public.projects;
create policy projects_category_read on public.projects for select to authenticated using (
  deleted_at is null and exists (
    select 1 from public.project_category_assignments a
    where a.project_id = projects.id and a.auditor_id = (select auth.uid())
  )
);
drop policy if exists tasks_read on public.gv_tasks;
create policy tasks_read on public.gv_tasks for select to authenticated using (
  app_private.current_role() = 'admin' or
  (deleted_at is null and exists (
    select 1 from public.projects p where p.id = project_id and p.deleted_at is null
  ) and (current_auditor_id = (select auth.uid()) or exists (
    select 1 from public.task_participants p where p.task_id = gv_tasks.id and p.user_id = (select auth.uid())
  )))
);

create or replace function app_private.can_read_task(target_task uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.gv_tasks t join public.projects p on p.id = t.project_id
    where t.id = target_task and t.deleted_at is null and p.deleted_at is null
      and (app_private.current_role() = 'admin' or
        (app_private.current_role() = 'auditor' and
          (t.current_auditor_id = (select auth.uid()) or exists (
            select 1 from public.task_participants part
            where part.task_id = target_task and part.user_id = (select auth.uid())
          )))
      )
  )
$$;
create or replace function app_private.can_write_round(target_round uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.task_rounds r
    join public.gv_tasks t on t.id = r.task_id and t.current_round_id = r.id
    join public.projects p on p.id = t.project_id
    where r.id = target_round and r.status in ('open', 'returned')
      and t.archived_at is null and t.deleted_at is null and p.deleted_at is null
      and (app_private.current_role() = 'admin' or
        (app_private.current_role() = 'auditor' and t.current_auditor_id = (select auth.uid())))
  )
$$;

-- 移入回收站的 LT 任务不妨碍重新派单。
create or replace function public.assign_project_category(p_project_id uuid, p_category_code text, p_auditor_id uuid)
returns table(task_id uuid, round_id uuid)
language plpgsql security invoker set search_path = '' as $$
declare v_task uuid; v_round uuid;
begin
  if app_private.current_role() <> 'admin' then raise exception '仅审核管理员可以分配'; end if;
  if p_category_code not in ('LT','SS','WE','EA','MR','EQ') then raise exception '类别无效'; end if;
  if not exists (select 1 from public.projects where id = p_project_id and deleted_at is null) then raise exception '项目不存在或已移入回收站'; end if;
  if not exists (select 1 from public.user_profiles where id = p_auditor_id and role = 'auditor' and active = true) then raise exception '审核员不可用'; end if;
  insert into public.project_category_assignments(project_id, category_code, auditor_id, assigned_by)
    values(p_project_id, p_category_code, p_auditor_id, (select auth.uid()))
    on conflict(project_id, category_code) do update set auditor_id = excluded.auditor_id, assigned_by = excluded.assigned_by, assigned_at = now();
  if p_category_code = 'LT' then
    select id, current_round_id into v_task, v_round from public.gv_tasks
      where project_id = p_project_id and deleted_at is null order by created_at limit 1;
    if v_task is null then
      insert into public.gv_tasks(project_id, current_auditor_id, system, system_version, stage, created_by)
        values(p_project_id, p_auditor_id, '待核对', '待核对', '待核对', (select auth.uid())) returning id into v_task;
      insert into public.task_rounds(task_id, sequence) values(v_task, 1) returning id into v_round;
      update public.gv_tasks set current_round_id = v_round where id = v_task;
    else
      update public.gv_tasks set current_auditor_id = p_auditor_id, updated_at = now() where id = v_task;
    end if;
    if not exists (select 1 from public.task_participants part where part.task_id = v_task and part.user_id = p_auditor_id and part.left_at is null) then
      insert into public.task_participants(task_id, user_id) values(v_task, p_auditor_id);
    end if;
  end if;
  return query select v_task, v_round;
end;
$$;
