-- Keep opinion submission consistent with fact corrections even when the RPC
-- is invoked directly, outside the Next.js route.
create or replace function public.submit_gv_opinion(
  p_task_id uuid, p_round_id uuid, p_english text, p_chinese text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_task public.gv_tasks%rowtype;
  v_round public.task_rounds%rowtype;
  v_required text[];
  v_code text;
  v_fact text;
  v_decision text;
  v_decision_at timestamptz;
  v_run_at timestamptz;
  v_pending boolean := false;
  v_opinion_id uuid;
begin
  if (select auth.uid()) is null or app_private.current_role() <> 'auditor' then
    raise exception '仅当前审核员可提交专业意见';
  end if;
  select * into v_task from public.gv_tasks where id = p_task_id for update;
  if not found or v_task.current_auditor_id <> (select auth.uid())
    or v_task.current_round_id <> p_round_id or v_task.archived_at is not null then
    raise exception '当前任务不可提交';
  end if;
  select * into v_round from public.task_rounds
    where id = p_round_id and task_id = p_task_id for update;
  if not found or v_round.status not in ('open', 'returned')
    or v_round.scope_confirmed_at is null then
    raise exception '请先确认本轮范围，或检查轮次状态';
  end if;
  if nullif(trim(p_english), '') is null or nullif(trim(p_chinese), '') is null then
    raise exception '英文意见和中文解释均须填写';
  end if;

  select created_at into v_run_at from public.gv_processing_runs
    where task_id = p_task_id and round_id = p_round_id
      and scope_confirmed_at = v_round.scope_confirmed_at
    order by created_at desc, id desc limit 1;
  if v_run_at is not null and exists (
    select 1 from public.gv_fact_confirmations f
    where f.task_id = p_task_id and f.round_id = p_round_id
      and f.scope_confirmed_at = v_round.scope_confirmed_at
      and f.created_at > v_run_at
  ) then
    raise exception '人工事实已更新，请重新运行规则计算后提交意见';
  end if;

  v_required := array['R01', 'R02'];
  if v_task.incentive_path = 'A' then v_required := array_append(v_required, 'R03');
  elsif v_task.incentive_path = 'B' then v_required := array_append(v_required, 'R04');
  else raise exception '申报路径尚未确认'; end if;
  if v_task.facility_path = 'C' then v_required := v_required || array['R05', 'R06'];
  elsif v_task.facility_path = 'D' then v_required := array_append(v_required, 'R07');
  else raise exception '申报路径尚未确认'; end if;

  foreach v_code in array v_required loop
    select fact_check, decision, created_at into v_fact, v_decision, v_decision_at
      from public.gv_rule_decisions
      where task_id = p_task_id and round_id = p_round_id and rule_code = v_code
        and scope_confirmed_at = v_round.scope_confirmed_at
      order by created_at desc, id desc limit 1;
    if not found then raise exception '仍有适用规则未保存判断：%', v_code; end if;
    if exists (
      select 1 from public.gv_fact_confirmations f
      where f.task_id = p_task_id and f.round_id = p_round_id
        and f.scope_confirmed_at = v_round.scope_confirmed_at
        and f.created_at > v_decision_at
        and (
          (f.field_key = 'total_parking_spaces' and v_code in ('R01', 'R03', 'R04', 'R05', 'R06', 'R07'))
          or (f.field_key = 'preferred_spaces' and v_code = 'R03')
          or (f.field_key = 'evse_spaces' and v_code in ('R05', 'R06'))
          or (f.field_key in ('normal_rate', 'green_rate') and v_code = 'R04')
          or (f.field_key = 'daily_service_capacity' and v_code = 'R07')
        )
    ) then
      raise exception '事实已修改，须重新确认规则判断：%', v_code;
    end if;
    if v_fact <> 'confirmed' or v_decision in ('supplement', 'defer') then
      v_pending := true;
    end if;
  end loop;

  insert into public.gv_round_opinions(
    task_id, round_id, scope_confirmed_at, english_opinion,
    chinese_explanation, has_pending_items, submitted_by
  ) values (
    p_task_id, p_round_id, v_round.scope_confirmed_at, trim(p_english),
    trim(p_chinese), v_pending, (select auth.uid())
  ) returning id into v_opinion_id;
  update public.task_rounds set status = 'submitted', submitted_at = now()
    where id = p_round_id;
  insert into public.operation_events(actor_id, event_type, success, task_id, round_id, object_id)
    values ((select auth.uid()), 'opinion_submit', true, p_task_id, p_round_id, v_opinion_id);
  return jsonb_build_object('opinion_id', v_opinion_id, 'has_pending_items', v_pending);
end;
$$;

revoke all on function public.submit_gv_opinion(uuid, uuid, text, text) from public, anon;
grant execute on function public.submit_gv_opinion(uuid, uuid, text, text) to authenticated;
revoke all on function public.admin_manage_gv_task(uuid, uuid, text, text) from public, anon;
