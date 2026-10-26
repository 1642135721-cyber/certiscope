-- 申报表单中的 GV 范围候选独立于管理员确认的五项建档字段。
create table public.project_scope_candidates (
  id uuid primary key default gen_random_uuid(),
  intake_file_path text not null,
  field_key text not null check (field_key in (
    'system', 'system_version', 'stage', 'credit_scope', 'incentive_path', 'facility_path'
  )),
  candidate_value text not null check (length(trim(candidate_value)) > 0),
  source_location jsonb not null,
  confidence numeric check (confidence between 0 and 1),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
create index project_scope_candidates_file_idx
  on public.project_scope_candidates(intake_file_path, field_key);
alter table public.project_scope_candidates enable row level security;

create policy project_scope_candidates_admin on public.project_scope_candidates
  for all to authenticated
  using (app_private.current_role() = 'admin')
  with check (app_private.current_role() = 'admin' and created_by = (select auth.uid()));

create policy project_scope_candidates_assignee_read on public.project_scope_candidates
  for select to authenticated
  using (
    app_private.current_role() = 'auditor' and exists (
      select 1 from public.projects p
      join public.gv_tasks t on t.project_id = p.id
      where p.intake_file_path = project_scope_candidates.intake_file_path
        and t.current_auditor_id = (select auth.uid())
    )
  );

grant select, insert on public.project_scope_candidates to authenticated;
