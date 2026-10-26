-- GV 当前内部确认的审核规则版本。官方原文和内部口径分别在规则目录与需求附录中定位。
create table public.gv_rule_packages (
  id uuid primary key,
  code text not null unique,
  system text not null,
  system_version text not null,
  stage text not null,
  credit text not null,
  package_version text not null,
  source_reference text not null,
  status text not null check (status in ('active', 'retired')),
  created_at timestamptz not null default now()
);
alter table public.gv_rule_packages enable row level security;
create policy gv_rule_packages_read on public.gv_rule_packages for select to authenticated using (true);
grant select on public.gv_rule_packages to authenticated;
insert into public.gv_rule_packages(id, code, system, system_version, stage, credit, package_version, source_reference, status)
values ('985953ee-0a17-468e-9bc7-d6c43325ff36', 'LT-GV', 'LEED', 'v4 BD+C NC', '设计审核',
  'Green Vehicles', 'GV-2026-10-23.1', 'LEED v4 BD+C NC Green Vehicles 官方条款；项目附录 A 已确认内部核对要点', 'active');

-- 范围确认时原子锁定与体系、版本、阶段相匹配的规则包。
create function app_private.lock_gv_rule_package() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_task public.gv_tasks%rowtype; v_package uuid;
begin
  if new.scope_confirmed_at is null or new.scope_confirmed_at is not distinct from old.scope_confirmed_at then return new; end if;
  select * into v_task from public.gv_tasks where id = new.task_id;
  select id into v_package from public.gv_rule_packages
    where code = 'LT-GV' and status = 'active' and system = v_task.system
      and system_version = v_task.system_version and stage = v_task.stage;
  if v_package is null then raise exception '当前体系、版本或阶段没有可用的 GV 规则包，请联系审核管理员'; end if;
  new.rule_version_id := v_package;
  update public.gv_tasks set rule_version_id = v_package where id = new.task_id;
  return new;
end;
$$;
revoke all on function app_private.lock_gv_rule_package() from public, anon, authenticated;
create trigger lock_gv_package_on_scope before update of scope_confirmed_at on public.task_rounds
  for each row execute function app_private.lock_gv_rule_package();
update public.task_rounds r set rule_version_id = '985953ee-0a17-468e-9bc7-d6c43325ff36'
  from public.gv_tasks t where t.id = r.task_id and r.scope_confirmed_at is not null
    and t.system = 'LEED' and t.system_version = 'v4 BD+C NC' and t.stage = '设计审核'
    and r.rule_version_id is null;
update public.gv_tasks t set rule_version_id = '985953ee-0a17-468e-9bc7-d6c43325ff36'
  where t.system = 'LEED' and t.system_version = 'v4 BD+C NC' and t.stage = '设计审核'
    and exists (select 1 from public.task_rounds r where r.id = t.current_round_id and r.scope_confirmed_at is not null)
    and t.rule_version_id is null;

create table public.gv_fact_confirmations (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.gv_tasks(id),
  round_id uuid not null references public.task_rounds(id),
  scope_confirmed_at timestamptz not null,
  field_key text not null check (field_key in ('total_parking_spaces','preferred_spaces','evse_spaces','normal_rate','green_rate','daily_service_capacity')),
  value numeric not null,
  unit text not null,
  candidate_id uuid references public.fact_candidates(id),
  source_location jsonb not null,
  reason text not null check (length(trim(reason)) > 0),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
create index gv_fact_confirmations_round_idx on public.gv_fact_confirmations(round_id, field_key, created_at desc);
alter table public.gv_fact_confirmations enable row level security;
create policy gv_fact_confirmations_read on public.gv_fact_confirmations for select to authenticated
  using (app_private.can_read_task(task_id));
create policy gv_fact_confirmations_insert on public.gv_fact_confirmations for insert to authenticated
  with check (created_by = (select auth.uid()) and app_private.current_role() = 'auditor'
    and app_private.can_write_round(round_id)
    and exists (select 1 from public.gv_tasks t where t.id = task_id and t.current_round_id = round_id and t.current_auditor_id = (select auth.uid()))
    and exists (select 1 from public.task_rounds r where r.id = round_id and r.scope_confirmed_at = scope_confirmed_at));
grant select, insert on public.gv_fact_confirmations to authenticated;

create table public.gv_processing_runs (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.gv_tasks(id),
  round_id uuid not null references public.task_rounds(id),
  scope_confirmed_at timestamptz not null,
  rule_version_id uuid not null references public.gv_rule_packages(id),
  selected_material_version_ids uuid[] not null,
  results jsonb not null,
  status text not null check (status in ('complete', 'partial')),
  error_message text,
  usage jsonb not null default '{}'::jsonb,
  provider text not null,
  model text not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
create index gv_processing_runs_round_idx on public.gv_processing_runs(round_id, created_at desc);
alter table public.gv_processing_runs enable row level security;
create policy gv_processing_runs_read on public.gv_processing_runs for select to authenticated
  using (app_private.can_read_task(task_id));
create policy gv_processing_runs_insert on public.gv_processing_runs for insert to authenticated
  with check (created_by = (select auth.uid()) and app_private.current_role() = 'auditor'
    and app_private.can_write_round(round_id)
    and exists (select 1 from public.gv_tasks t where t.id = task_id and t.current_round_id = round_id and t.current_auditor_id = (select auth.uid()) and t.rule_version_id = rule_version_id)
    and exists (select 1 from public.task_rounds r where r.id = round_id and r.scope_confirmed_at = scope_confirmed_at and r.rule_version_id = rule_version_id and r.selected_material_version_ids = selected_material_version_ids));
grant select, insert on public.gv_processing_runs to authenticated;
