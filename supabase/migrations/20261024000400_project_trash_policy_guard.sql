-- 内部只读判断避免 projects / gv_tasks / category RLS 互相递归。
create function app_private.project_is_active(target_project uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.projects p where p.id = target_project and p.deleted_at is null)
$$;
revoke all on function app_private.project_is_active(uuid) from public, anon;
grant execute on function app_private.project_is_active(uuid) to authenticated;

drop policy if exists tasks_read on public.gv_tasks;
create policy tasks_read on public.gv_tasks for select to authenticated using (
  app_private.current_role() = 'admin' or
  (deleted_at is null and app_private.project_is_active(project_id) and
    (current_auditor_id = (select auth.uid()) or exists (
      select 1 from public.task_participants p where p.task_id = gv_tasks.id and p.user_id = (select auth.uid())
    )))
);
drop policy if exists project_source_read on public.project_source_files;
create policy project_source_read on public.project_source_files for select to authenticated using (
  app_private.current_role() = 'admin' or
  (app_private.project_is_active(project_id) and exists (
    select 1 from public.project_category_assignments a
    where a.project_id = project_source_files.project_id and a.auditor_id = (select auth.uid())
  ))
);
drop policy if exists category_assignment_read on public.project_category_assignments;
create policy category_assignment_read on public.project_category_assignments for select to authenticated using (
  app_private.current_role() = 'admin' or
  (auditor_id = (select auth.uid()) and app_private.project_is_active(project_id))
);
drop policy if exists gv_intake_assigned_read on storage.objects;
create policy gv_intake_assigned_read on storage.objects for select to authenticated using (
  bucket_id = 'gv-intake' and exists (
    select 1 from public.project_source_files f
    join public.project_category_assignments a on a.project_id = f.project_id
    where f.storage_path = name and a.auditor_id = (select auth.uid())
      and app_private.project_is_active(f.project_id)
  )
);
