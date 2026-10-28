-- Submitted opinions stay immutable; the assigned auditor may append a new AI
-- candidate run against the already locked scope and materials.
create function app_private.can_insert_submitted_gv_run(
  target_task uuid,
  target_round uuid,
  target_scope timestamptz,
  target_rule uuid,
  target_materials uuid[]
) returns boolean language sql stable security definer set search_path = '' as $$
  select app_private.current_role() = 'auditor' and exists (
    select 1 from public.gv_tasks t
    join public.projects p on p.id = t.project_id
    join public.task_rounds r on r.id = target_round
    where t.id = target_task
      and t.current_round_id = target_round
      and t.current_auditor_id = (select auth.uid())
      and t.rule_version_id = target_rule
      and t.archived_at is null
      and t.deleted_at is null
      and p.deleted_at is null
      and r.task_id = t.id
      and r.status = 'submitted'
      and r.scope_confirmed_at = target_scope
      and r.rule_version_id = target_rule
      and r.selected_material_version_ids = target_materials
  )
$$;
revoke all on function app_private.can_insert_submitted_gv_run(uuid, uuid, timestamptz, uuid, uuid[]) from public;
grant execute on function app_private.can_insert_submitted_gv_run(uuid, uuid, timestamptz, uuid, uuid[]) to authenticated;

create policy gv_processing_runs_insert_submitted on public.gv_processing_runs
  for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and cleared_at is null
    and cleared_by is null
    and app_private.can_insert_submitted_gv_run(
      task_id, round_id, scope_confirmed_at, rule_version_id,
      selected_material_version_ids
    )
  );
