-- 申报单缺失时允许从本轮材料核对范围；仍要求审核员写明原件依据。
create or replace function app_private.confirm_gv_scope(
  p_task_id uuid, p_round_id uuid, p_system text, p_system_version text,
  p_stage text, p_credit_scope text, p_incentive_path text, p_facility_path text,
  p_material_version_ids uuid[], p_reason text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_task public.gv_tasks%rowtype;
  v_round public.task_rounds%rowtype;
  v_intake_path text;
  v_candidates jsonb;
  v_chosen jsonb;
  v_field text;
  v_value text;
  v_match_count integer;
begin
  if (select auth.uid()) is null or app_private.current_role() <> 'auditor' then
    raise exception '仅当前审核员可确认审核范围';
  end if;
  select * into v_task from public.gv_tasks where id = p_task_id for update;
  if not found or v_task.current_auditor_id <> (select auth.uid())
    or v_task.current_round_id <> p_round_id or v_task.archived_at is not null then
    raise exception '当前任务或轮次不可确认';
  end if;
  select * into v_round from public.task_rounds where id = p_round_id and task_id = p_task_id for update;
  if not found or v_round.status not in ('open','returned') then
    raise exception '当前轮次已锁定';
  end if;
  if nullif(trim(p_system), '') is null or nullif(trim(p_system_version), '') is null
    or nullif(trim(p_stage), '') is null or p_credit_scope <> 'LT · Green Vehicles'
    or p_incentive_path not in ('A','B') or p_facility_path not in ('C','D') then
    raise exception '体系、版本、阶段、GV 范围或申报路径不完整';
  end if;
  if cardinality(coalesce(p_material_version_ids, '{}'::uuid[])) = 0 then
    raise exception '请至少选择一份本轮材料';
  end if;
  if cardinality(p_material_version_ids) <> (
    select count(distinct id) from public.material_versions
    where id = any(p_material_version_ids) and task_id = p_task_id and round_id = p_round_id
  ) then raise exception '所选材料版本与当前轮次不符'; end if;

  select intake_file_path into v_intake_path from public.projects where id = v_task.project_id;
  select coalesce(jsonb_agg(jsonb_build_object('field',field_key,'value',candidate_value,
    'source',source_location,'confidence',confidence) order by created_at),'[]'::jsonb)
    into v_candidates from public.project_scope_candidates where intake_file_path = v_intake_path;
  v_chosen := jsonb_build_object('system',trim(p_system),'system_version',trim(p_system_version),
    'stage',trim(p_stage),'credit_scope',p_credit_scope,
    'incentive_path',p_incentive_path,'facility_path',p_facility_path);
  if v_intake_path is null and nullif(trim(coalesce(p_reason,'')), '') is null then
    raise exception '无申报表单时须填写本轮材料的原件依据及理由';
  end if;
  if v_intake_path is not null then
    for v_field, v_value in select key, value from jsonb_each_text(v_chosen) loop
      select count(distinct candidate_value) into v_match_count
        from public.project_scope_candidates
        where intake_file_path = v_intake_path and field_key = v_field;
      if (v_match_count <> 1 or not exists (
        select 1 from public.project_scope_candidates where intake_file_path = v_intake_path
          and field_key = v_field and candidate_value = v_value
      )) and nullif(trim(coalesce(p_reason,'')), '') is null then
        raise exception '候选缺失、冲突或修正时须填写原件依据及理由';
      end if;
    end loop;
  end if;
  update public.gv_tasks set system=trim(p_system), system_version=trim(p_system_version),
    stage=trim(p_stage), incentive_path=p_incentive_path, facility_path=p_facility_path,
    updated_at=now() where id=p_task_id;
  update public.task_rounds set selected_material_version_ids=p_material_version_ids,
    scope_confirmed_at=now(), scope_confirmed_by=(select auth.uid()),
    scope_snapshot=jsonb_build_object('chosen',v_chosen,'intake_candidates',v_candidates,
      'intake_file_path',v_intake_path,'material_version_ids',to_jsonb(p_material_version_ids),
      'reason',nullif(trim(coalesce(p_reason,'')),'')) where id=p_round_id;
  insert into public.operation_events(actor_id,event_type,success,task_id,round_id)
    values ((select auth.uid()),'confirmation',true,p_task_id,p_round_id);
  return jsonb_build_object('task_id',p_task_id,'round_id',p_round_id,'chosen',v_chosen);
end;
$$;
