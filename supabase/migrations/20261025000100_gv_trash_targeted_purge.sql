-- 仅对管理员已移入回收站、并再次核对名称的单个项目或任务执行永久清理。
-- 不修改现有外键行为；数据库删除在一次 RPC 事务中完成。
create table public.gv_storage_cleanup_queue (
  bucket_id text not null check (bucket_id in ('gv-intake', 'gv-materials')),
  storage_path text not null,
  queued_at timestamptz not null default now(),
  primary key(bucket_id, storage_path)
);
alter table public.gv_storage_cleanup_queue enable row level security;
create policy gv_cleanup_admin_select on public.gv_storage_cleanup_queue for select to authenticated
  using (app_private.current_role() = 'admin');
create policy gv_cleanup_admin_delete on public.gv_storage_cleanup_queue for delete to authenticated
  using (app_private.current_role() = 'admin');
grant select, delete on public.gv_storage_cleanup_queue to authenticated;
create policy gv_trash_storage_delete on storage.objects for delete to authenticated using (
  bucket_id in ('gv-intake', 'gv-materials') and app_private.current_role() = 'admin'
  and exists (select 1 from public.gv_storage_cleanup_queue q
    where q.bucket_id = storage.objects.bucket_id and q.storage_path = storage.objects.name)
);

create function app_private.purge_one_gv_task(target_task uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.gv_tasks set current_round_id = null where id = target_task;
  insert into public.gv_storage_cleanup_queue(bucket_id, storage_path)
    select 'gv-materials', storage_path from public.material_versions where task_id = target_task
    on conflict do nothing;
  delete from public.gv_admin_actions where task_id = target_task;
  delete from public.gv_admin_summaries where task_id = target_task;
  delete from public.gv_fact_confirmations where task_id = target_task;
  delete from public.gv_processing_runs where task_id = target_task;
  delete from public.gv_round_opinions where task_id = target_task;
  delete from public.gv_rule_ai_assessments where task_id = target_task;
  delete from public.gv_rule_decisions where task_id = target_task;
  delete from public.gv_supplement_checks where task_id = target_task;
  delete from public.fact_candidates where task_id = target_task;
  delete from public.parsed_fragments where material_version_id in
    (select id from public.material_versions where task_id = target_task);
  delete from public.material_versions where task_id = target_task;
  delete from public.materials where task_id = target_task;
  delete from public.project_create_requests where task_id = target_task;
  delete from public.task_participants where task_id = target_task;
  delete from public.task_rounds where task_id = target_task;
  delete from public.operation_events where task_id = target_task;
  delete from public.gv_tasks where id = target_task;
end;
$$;
revoke all on function app_private.purge_one_gv_task(uuid) from public, anon, authenticated;

create function public.admin_purge_gv_trash(p_kind text, p_id uuid, p_confirm_name text)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_project public.projects%rowtype; v_task public.gv_tasks%rowtype;
        v_task_id uuid; v_paths text[]; v_count integer;
begin
  if (select auth.uid()) is null or app_private.current_role() <> 'admin' then
    raise exception '仅审核管理员可以永久删除';
  end if;
  if p_kind = 'task' then
    select * into v_task from public.gv_tasks where id = p_id for update;
    if v_task.id is null or v_task.deleted_at is null then raise exception '任务不在回收站'; end if;
    select * into v_project from public.projects where id = v_task.project_id;
    if v_project.deleted_at is not null then raise exception '请从项目回收站删除整个项目'; end if;
    if p_confirm_name <> v_project.name || p_confirm_name is null then raise exception '项目名称确认不一致'; end if;
    perform app_private.purge_one_gv_task(p_id);
  elsif p_kind = 'project' then
    select * into v_project from public.projects where id = p_id for update;
    if v_project.id is null or v_project.deleted_at is null then raise exception '项目不在回收站'; end if;
    if p_confirm_name <> v_project.name || p_confirm_name is null then raise exception '项目名称确认不一致'; end if;
    for v_task_id in select id from public.gv_tasks where project_id = p_id order by created_at loop
      perform app_private.purge_one_gv_task(v_task_id);
    end loop;
    select array_agg(storage_path) into v_paths from public.project_source_files where project_id = p_id;
    v_paths := array_remove(array_append(coalesce(v_paths, '{}'::text[]), v_project.intake_file_path), null);
    insert into public.gv_storage_cleanup_queue(bucket_id, storage_path)
      select 'gv-intake', unnest(v_paths) on conflict do nothing;
    delete from public.project_intake_candidates where intake_file_path = any(v_paths);
    delete from public.project_scope_candidates where intake_file_path = any(v_paths);
    delete from public.project_create_requests where project_id = p_id;
    delete from public.project_category_assignments where project_id = p_id;
    delete from public.project_source_files where project_id = p_id;
    delete from public.operation_events where object_id = p_id;
    delete from public.projects where id = p_id;
  else
    raise exception '永久删除对象无效';
  end if;
  select count(*) into v_count from public.gv_storage_cleanup_queue;
  return v_count;
end;
$$;
revoke all on function public.admin_purge_gv_trash(text, uuid, text) from public, anon;
grant execute on function public.admin_purge_gv_trash(text, uuid, text) to authenticated;
