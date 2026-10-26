create table public.gv_rule_ai_assessments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.gv_tasks(id),
  round_id uuid not null references public.task_rounds(id),
  rule_code text not null check (rule_code in ('R01','R02','R03','R04','R05','R06','R07')),
  scope_confirmed_at timestamptz not null,
  support text not null check (support in ('supports','partial','insufficient','conflicts','unknown')),
  citations jsonb not null default '[]'::jsonb,
  gaps jsonb not null default '[]'::jsonb,
  human_questions jsonb not null default '[]'::jsonb,
  provider text not null,
  model text not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
create index gv_rule_ai_assessments_round_idx on public.gv_rule_ai_assessments(round_id, rule_code, created_at desc);
alter table public.gv_rule_ai_assessments enable row level security;
create policy gv_rule_ai_assessments_read on public.gv_rule_ai_assessments for select to authenticated
  using (app_private.can_read_task(task_id));
create policy gv_rule_ai_assessments_insert on public.gv_rule_ai_assessments for insert to authenticated
  with check (created_by = (select auth.uid()) and app_private.current_role() = 'auditor'
    and app_private.can_write_round(round_id)
    and exists (select 1 from public.gv_tasks t where t.id = task_id and t.current_auditor_id = (select auth.uid()) and t.current_round_id = round_id)
    and exists (select 1 from public.task_rounds r where r.id = round_id and r.scope_confirmed_at = scope_confirmed_at));
grant select, insert on public.gv_rule_ai_assessments to authenticated;
