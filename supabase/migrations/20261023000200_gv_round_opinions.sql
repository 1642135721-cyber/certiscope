create table public.gv_round_opinions (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.gv_tasks(id),
  round_id uuid not null references public.task_rounds(id),
  scope_confirmed_at timestamptz not null,
  english_opinion text not null check (length(trim(english_opinion)) > 0),
  chinese_explanation text not null check (length(trim(chinese_explanation)) > 0),
  has_pending_items boolean not null,
  submitted_by uuid not null references auth.users(id),
  submitted_at timestamptz not null default now()
);
create index gv_round_opinions_round_idx on public.gv_round_opinions(round_id, submitted_at desc);
alter table public.gv_round_opinions enable row level security;
create policy gv_round_opinions_read on public.gv_round_opinions for select to authenticated
  using (app_private.can_read_task(task_id));
grant select on public.gv_round_opinions to authenticated;

create function public.submit_gv_opinion(p_task_id uuid, p_round_id uuid, p_english text, p_chinese text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_task public.gv_tasks%rowtype;
  v_round public.task_rounds%rowtype;
  v_required text[];
  v_code text;
  v_fact text;
  v_decision text;
  v_pending boolean := false;
  v_opinion_id uuid;
begin
  if app_private.current_role() <> 'auditor' then raise exception '仅当前审核员可提交专业意见'; end if;
  select * into v_task from public.gv_tasks where id = p_task_id for update;
  if not found or v_task.current_auditor_id <> (select auth.uid()) or v_task.current_round_id <> p_round_id or v_task.archived_at is not null then
    raise exception '当前任务不可提交';
  end if;
  select * into v_round from public.task_rounds where id = p_round_id and task_id = p_task_id for update;
  if not found or v_round.status not in ('open','returned') or v_round.scope_confirmed_at is null then
    raise exception '请先确认本轮范围，或检查轮次状态';
  end if;
  if nullif(trim(p_english), '') is null or nullif(trim(p_chinese), '') is null then
    raise exception '英文意见和中文解释均须填写';
  end if;
  v_required := array['R01','R02'];
  if v_task.incentive_path = 'A' then v_required := array_append(v_required, 'R03');
  elsif v_task.incentive_path = 'B' then v_required := array_append(v_required, 'R04');
  else raise exception '申报路径尚未确认'; end if;
  if v_task.facility_path = 'C' then v_required := v_required || array['R05','R06'];
  elsif v_task.facility_path = 'D' then v_required := array_append(v_required, 'R07');
  else raise exception '申报路径尚未确认'; end if;
  foreach v_code in array v_required loop
    select fact_check, decision into v_fact, v_decision from public.gv_rule_decisions
      where task_id = p_task_id and round_id = p_round_id and rule_code = v_code
        and scope_confirmed_at = v_round.scope_confirmed_at
      order by created_at desc, id desc limit 1;
    if not found then raise exception '仍有适用规则未保存判断：%', v_code; end if;
    if v_fact <> 'confirmed' or v_decision in ('supplement','defer') then v_pending := true; end if;
  end loop;
  insert into public.gv_round_opinions(task_id, round_id, scope_confirmed_at, english_opinion,
    chinese_explanation, has_pending_items, submitted_by)
    values (p_task_id, p_round_id, v_round.scope_confirmed_at, trim(p_english), trim(p_chinese), v_pending, (select auth.uid()))
    returning id into v_opinion_id;
  update public.task_rounds set status = 'submitted', submitted_at = now() where id = p_round_id;
  insert into public.operation_events(actor_id, event_type, success, task_id, round_id, object_id)
    values ((select auth.uid()), 'opinion_submit', true, p_task_id, p_round_id, v_opinion_id);
  return jsonb_build_object('opinion_id', v_opinion_id, 'has_pending_items', v_pending);
end;
$$;
revoke all on function public.submit_gv_opinion(uuid, uuid, text, text) from public;
grant execute on function public.submit_gv_opinion(uuid, uuid, text, text) to authenticated;
