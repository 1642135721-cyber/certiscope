create or replace function public.assign_project_category(p_project_id uuid, p_category_code text, p_auditor_id uuid)
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

