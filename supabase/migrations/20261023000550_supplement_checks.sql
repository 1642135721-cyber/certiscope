create table if not exists public.gv_supplement_checks (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.gv_tasks(id),
  round_id uuid not null references public.task_rounds(id),
  requirement_index integer not null check (requirement_index >= 0),
  requirement_text text not null,
  verdict text not null check (verdict in ('responded', 'still_missing')),
  note text not null default '',
  saved_by uuid not null references auth.users(id),
  saved_at timestamptz not null default now(),
  unique (round_id, requirement_index)
);

alter table public.gv_supplement_checks enable row level security;
create policy gv_supplement_checks_read on public.gv_supplement_checks for select to authenticated
  using (app_private.can_read_task(task_id));
create policy gv_supplement_checks_insert on public.gv_supplement_checks for insert to authenticated
  with check (saved_by = (select auth.uid()) and app_private.can_write_round(round_id)
    and exists (select 1 from public.gv_tasks t where t.id = task_id and t.current_round_id = round_id and t.current_auditor_id = (select auth.uid())));
create policy gv_supplement_checks_update on public.gv_supplement_checks for update to authenticated
  using (saved_by = (select auth.uid()) and app_private.can_write_round(round_id))
  with check (saved_by = (select auth.uid()) and app_private.can_write_round(round_id));
