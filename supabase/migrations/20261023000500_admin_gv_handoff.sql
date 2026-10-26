create table public.gv_admin_summaries (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.gv_tasks(id),
  round_id uuid not null references public.task_rounds(id),
  english_summary text not null check (length(trim(english_summary)) > 0),
  chinese_summary text not null check (length(trim(chinese_summary)) > 0),
  confirmed boolean not null default false,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
create index gv_admin_summaries_round_idx on public.gv_admin_summaries(round_id, created_at desc);
alter table public.gv_admin_summaries enable row level security;
create policy gv_admin_summaries_read on public.gv_admin_summaries for select to authenticated
  using (app_private.can_read_task(task_id));
create policy gv_admin_summaries_insert on public.gv_admin_summaries for insert to authenticated
  with check (app_private.current_role() = 'admin' and created_by = (select auth.uid())
    and exists (select 1 from public.task_rounds r join public.gv_tasks t on t.id = r.task_id
      where r.id = round_id and t.id = task_id and t.current_round_id = round_id
        and r.status = 'submitted' and t.archived_at is null));
grant select, insert on public.gv_admin_summaries to authenticated;

create table public.gv_admin_actions (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.gv_tasks(id),
  round_id uuid not null references public.task_rounds(id),
  action text not null check (action in ('return','supplement','archive')),
  reason text not null check (length(trim(reason)) > 0),
  new_round_id uuid references public.task_rounds(id),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
create index gv_admin_actions_task_idx on public.gv_admin_actions(task_id, created_at desc);
alter table public.gv_admin_actions enable row level security;
create policy gv_admin_actions_read on public.gv_admin_actions for select to authenticated
  using (app_private.can_read_task(task_id));
grant select on public.gv_admin_actions to authenticated;

create function app_private.prevent_submitted_material_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.task_rounds where id = new.round_id and submitted_at is not null) then
    raise exception '本轮意见已提交，材料已锁定；补件请开启新轮';
  end if;
  return new;
end;
$$;
create trigger lock_material_after_opinion before insert on public.material_versions
  for each row execute function app_private.prevent_submitted_material_change();

create function app_private.prevent_submitted_scope_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.submitted_at is not null and
    (new.scope_confirmed_at is distinct from old.scope_confirmed_at or new.scope_snapshot is distinct from old.scope_snapshot) then
    raise exception '本轮意见已提交，审核范围已锁定';
  end if;
  return new;
end;
$$;
create trigger lock_scope_after_opinion before update of scope_confirmed_at, scope_snapshot on public.task_rounds
  for each row execute function app_private.prevent_submitted_scope_change();

create function public.admin_manage_gv_task(p_task_id uuid, p_round_id uuid, p_action text, p_reason text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_task public.gv_tasks%rowtype;
  v_round public.task_rounds%rowtype;
  v_new_round uuid;
  v_latest_opinion public.gv_round_opinions%rowtype;
  v_latest_summary public.gv_admin_summaries%rowtype;
begin
  if app_private.current_role() <> 'admin' then raise exception '仅审核管理员可操作'; end if;
  if p_action not in ('return','supplement','archive') or nullif(trim(coalesce(p_reason,'')), '') is null then
    raise exception '请选择处理方式并填写依据';
  end if;
  select * into v_task from public.gv_tasks where id=p_task_id for update;
  if not found or v_task.current_round_id <> p_round_id or v_task.archived_at is not null then
    raise exception '当前任务或轮次不可处理';
  end if;
  select * into v_round from public.task_rounds where id=p_round_id and task_id=p_task_id for update;
  if not found or v_round.status <> 'submitted' then raise exception '请先等待审核员提交本轮意见'; end if;
  if p_action = 'return' then
    update public.task_rounds set status='returned' where id=p_round_id;
    insert into public.operation_events(actor_id,event_type,success,task_id,round_id)
      values ((select auth.uid()),'return',true,p_task_id,p_round_id);
  elsif p_action = 'supplement' then
    insert into public.task_rounds(task_id,sequence,source,status)
      values (p_task_id,v_round.sequence+1,'supplement','open') returning id into v_new_round;
    update public.gv_tasks set current_round_id=v_new_round, updated_at=now() where id=p_task_id;
  else
    select * into v_latest_opinion from public.gv_round_opinions where round_id=p_round_id
      order by submitted_at desc limit 1;
    select * into v_latest_summary from public.gv_admin_summaries where round_id=p_round_id
      order by created_at desc limit 1;
    if v_latest_opinion.id is null or v_latest_opinion.has_pending_items or
      v_latest_summary.id is null or not v_latest_summary.confirmed then
      raise exception '仅在汇总已确认且无待跟进事项时可归档';
    end if;
    update public.task_rounds set status='archived' where id=p_round_id;
    update public.gv_tasks set archived_at=now(), archived_by=(select auth.uid()), updated_at=now() where id=p_task_id;
    insert into public.operation_events(actor_id,event_type,success,task_id,round_id)
      values ((select auth.uid()),'archive',true,p_task_id,p_round_id);
  end if;
  insert into public.gv_admin_actions(task_id,round_id,action,reason,new_round_id,created_by)
    values (p_task_id,p_round_id,p_action,trim(p_reason),v_new_round,(select auth.uid()));
  return jsonb_build_object('task_id',p_task_id,'round_id',p_round_id,'action',p_action,'new_round_id',v_new_round);
end;
$$;
revoke all on function public.admin_manage_gv_task(uuid,uuid,text,text) from public;
grant execute on function public.admin_manage_gv_task(uuid,uuid,text,text) to authenticated;
