-- 建档仅确认项目五项资料；任务范围保留系统识别的暂定值，由当前审核员本轮确认。
create or replace function public.create_gv_project(
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
    then
    raise exception '项目五项资料必须由管理员核对填写';
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

