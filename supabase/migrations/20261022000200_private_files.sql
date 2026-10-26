-- 所有项目文件使用私有 bucket。路径首段固定为任务 ID。
insert into storage.buckets (id, name, public, file_size_limit)
values
  ('gv-materials', 'gv-materials', false, 52428800),
  ('gv-exports', 'gv-exports', false, 52428800),
  ('gv-intake', 'gv-intake', false, 52428800)
on conflict (id) do nothing;

create function app_private.storage_task_id(object_name text)
returns uuid language plpgsql immutable set search_path = '' as $$
declare
  first_segment text := split_part(object_name, '/', 1);
begin
  if first_segment !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return null;
  end if;
  return first_segment::uuid;
end;
$$;

-- gv_tasks 和 task_participants 在下一项迁移中建立；运行时才执行查询。
create function app_private.can_read_task_file(object_name text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  target_task uuid := app_private.storage_task_id(object_name);
begin
  if target_task is null or app_private.current_role() not in ('admin', 'auditor') then
    return false;
  end if;
  if app_private.current_role() = 'admin' then
    return exists (select 1 from public.gv_tasks where id = target_task);
  end if;
  return exists (
    select 1 from public.gv_tasks t where t.id = target_task and t.current_auditor_id = (select auth.uid())
  ) or exists (
    select 1 from public.task_participants p where p.task_id = target_task and p.user_id = (select auth.uid())
  );
end;
$$;

create function app_private.can_write_task_file(object_name text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  target_task uuid := app_private.storage_task_id(object_name);
begin
  if target_task is null or app_private.current_role() not in ('admin', 'auditor') then
    return false;
  end if;
  return exists (
    select 1 from public.gv_tasks t
    join public.task_rounds r on r.id = t.current_round_id
    where t.id = target_task and t.archived_at is null and r.status in ('open', 'returned')
      and (app_private.current_role() = 'admin' or t.current_auditor_id = (select auth.uid()))
  );
end;
$$;

revoke all on function app_private.storage_task_id(text) from public;
revoke all on function app_private.can_read_task_file(text) from public;
revoke all on function app_private.can_write_task_file(text) from public;
grant execute on function app_private.storage_task_id(text) to authenticated;
grant execute on function app_private.can_read_task_file(text) to authenticated;
grant execute on function app_private.can_write_task_file(text) to authenticated;

create policy gv_materials_read on storage.objects for select to authenticated
  using (bucket_id = 'gv-materials' and app_private.can_read_task_file(name));
create policy gv_materials_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'gv-materials' and app_private.can_write_task_file(name));
create policy gv_exports_admin_read on storage.objects for select to authenticated
  using (bucket_id = 'gv-exports' and app_private.current_role() = 'admin' and app_private.can_read_task_file(name));
create policy gv_exports_admin_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'gv-exports' and app_private.current_role() = 'admin' and app_private.can_read_task_file(name));
create policy gv_intake_admin_read on storage.objects for select to authenticated
  using (bucket_id = 'gv-intake' and app_private.current_role() = 'admin' and split_part(name, '/', 1) = (select auth.uid())::text);
create policy gv_intake_admin_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'gv-intake' and app_private.current_role() = 'admin' and split_part(name, '/', 1) = (select auth.uid())::text);
