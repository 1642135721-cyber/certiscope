-- Hide an AI run from the current review without deleting its audit history.
alter table public.gv_processing_runs
  add column cleared_at timestamptz,
  add column cleared_by uuid references auth.users(id);

create policy gv_processing_runs_clear on public.gv_processing_runs
  for update to authenticated
  using (
    app_private.current_role() = 'auditor'
    and app_private.can_write_round(round_id)
    and exists (
      select 1 from public.gv_tasks t
      where t.id = task_id
        and t.current_round_id = round_id
        and t.current_auditor_id = (select auth.uid())
    )
  )
  with check (
    app_private.current_role() = 'auditor'
    and app_private.can_write_round(round_id)
    and cleared_at is not null
    and cleared_by = (select auth.uid())
    and exists (
      select 1 from public.gv_tasks t
      where t.id = task_id
        and t.current_round_id = round_id
        and t.current_auditor_id = (select auth.uid())
    )
  );

grant update (cleared_at, cleared_by) on public.gv_processing_runs to authenticated;
