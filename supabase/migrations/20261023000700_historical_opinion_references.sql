create function public.applicable_historical_gv_opinions(p_task_id uuid)
returns table(source_project text, source_task_id uuid, source_round_id uuid, submitted_at timestamptz, english_opinion text, chinese_explanation text, rule_version_id uuid)
language sql stable security definer set search_path = '' as $$
  select p.name, h.id, o.round_id, o.submitted_at, o.english_opinion, o.chinese_explanation, h.rule_version_id
  from public.gv_tasks current_task
  join public.gv_tasks h on h.id <> current_task.id
    and h.archived_at is not null
    and h.rule_version_id is not null
    and h.rule_version_id = current_task.rule_version_id
    and h.incentive_path = current_task.incentive_path
    and h.facility_path = current_task.facility_path
  join public.projects p on p.id = h.project_id
  join public.gv_round_opinions o on o.task_id = h.id and o.has_pending_items = false
  where current_task.id = p_task_id
    and current_task.current_auditor_id = (select auth.uid())
    and current_task.archived_at is null
    and app_private.current_role() = 'auditor'
  order by o.submitted_at desc
  limit 5;
$$;
revoke all on function public.applicable_historical_gv_opinions(uuid) from public;
grant execute on function public.applicable_historical_gv_opinions(uuid) to authenticated;
