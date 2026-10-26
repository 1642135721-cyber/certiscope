-- A submitted round keeps the evidence it actually used. Unselected files can
-- still be removed from the active project without changing saved opinions.
create or replace function public.admin_remove_material(p_project_id uuid, p_source_file_id uuid default null, p_version_id uuid default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_round uuid;
  v_status text;
  v_selected boolean;
  v_version public.material_versions%rowtype;
  v_source public.project_source_files%rowtype;
begin
  if app_private.current_role() <> 'admin' then raise exception '仅审核管理员可以移除材料'; end if;
  if (p_source_file_id is null) = (p_version_id is null) then raise exception '必须指定一份材料'; end if;
  if not exists (select 1 from public.projects where id = p_project_id and deleted_at is null) then raise exception '项目不存在'; end if;

  if p_source_file_id is not null then
    select * into v_source from public.project_source_files where id = p_source_file_id and project_id = p_project_id and removed_at is null for update;
    if not found then raise exception '材料不存在或已移除'; end if;
    update public.project_source_files set removed_at = now() where id = p_source_file_id;
    update public.projects set intake_file_path = null where id = p_project_id and intake_file_path = v_source.storage_path;
    for v_version in select v.* from public.material_versions v join public.gv_tasks t on t.id = v.task_id
      where t.project_id = p_project_id and v.request_key = 'project-source-' || p_source_file_id::text and v.removed_at is null
    loop
      perform public.admin_remove_material(p_project_id, null, v_version.id);
    end loop;
    return;
  end if;

  select v.* into v_version from public.material_versions v join public.gv_tasks t on t.id = v.task_id
    where v.id = p_version_id and t.project_id = p_project_id and v.removed_at is null for update of v;
  if not found then raise exception '任务材料不存在或已移除'; end if;
  select r.id, r.status, p_version_id = any(r.selected_material_version_ids)
    into v_round, v_status, v_selected
    from public.task_rounds r join public.gv_tasks t on t.id = r.task_id
    where r.id = v_version.round_id and t.current_round_id = r.id and t.archived_at is null;
  if v_round is null then raise exception '历史轮次或已归档材料不能从当前项目移除'; end if;
  if coalesce(v_selected, false) and v_status not in ('open','returned') then
    raise exception '已提交轮次使用的材料不能移除；未选入本轮的材料可以移除';
  end if;
  update public.material_versions set removed_at = now() where id = p_version_id;
  if coalesce(v_selected, false) then
    update public.task_rounds set
      selected_material_version_ids = array_remove(selected_material_version_ids, p_version_id),
      scope_confirmed_at = null, scope_confirmed_by = null, scope_snapshot = null
      where id = v_round;
  end if;
end;
$$;
