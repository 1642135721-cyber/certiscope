-- 回收站中的项目材料仅审核管理员可读，审核员在恢复后重新取得权限。
drop policy if exists project_source_read on public.project_source_files;
create policy project_source_read on public.project_source_files for select to authenticated using (
  app_private.current_role() = 'admin' or exists (
    select 1 from public.project_category_assignments a
    join public.projects p on p.id = a.project_id
    where a.project_id = project_source_files.project_id
      and a.auditor_id = (select auth.uid()) and p.deleted_at is null
  )
);
drop policy if exists category_assignment_read on public.project_category_assignments;
create policy category_assignment_read on public.project_category_assignments for select to authenticated using (
  app_private.current_role() = 'admin' or
  (auditor_id = (select auth.uid()) and exists (
    select 1 from public.projects p where p.id = project_id and p.deleted_at is null
  ))
);
drop policy if exists gv_intake_assigned_read on storage.objects;
create policy gv_intake_assigned_read on storage.objects for select to authenticated using (
  bucket_id = 'gv-intake' and exists (
    select 1 from public.project_source_files f
    join public.project_category_assignments a on a.project_id = f.project_id
    join public.projects p on p.id = f.project_id
    where f.storage_path = name and a.auditor_id = (select auth.uid()) and p.deleted_at is null
  )
);
