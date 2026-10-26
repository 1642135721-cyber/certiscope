create function app_private.can_read_material_version(target_version uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.material_versions v
    join public.gv_tasks t on t.id = v.task_id
    where v.id = target_version and (
      app_private.current_role() = 'admin'
      or (app_private.current_role() = 'auditor' and t.current_auditor_id = (select auth.uid()))
      or (app_private.current_role() = 'auditor' and exists (
        select 1 from public.task_participants p
        where p.task_id = v.task_id and p.user_id = (select auth.uid())
          and v.created_at >= p.joined_at and (p.left_at is null or v.created_at <= p.left_at)
      ))
    )
  )
$$;
revoke all on function app_private.can_read_material_version(uuid) from public;
grant execute on function app_private.can_read_material_version(uuid) to authenticated;

create or replace function app_private.can_read_task_file(object_name text)
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
  if exists (select 1 from public.gv_tasks where id = target_task and current_auditor_id = (select auth.uid())) then
    return true;
  end if;
  return exists (
    select 1 from public.material_versions v
    join public.task_participants p on p.task_id = v.task_id and p.user_id = (select auth.uid())
    where v.task_id = target_task and v.storage_path = object_name
      and v.created_at >= p.joined_at and (p.left_at is null or v.created_at <= p.left_at)
  );
end;
$$;

drop policy material_versions_read on public.material_versions;
create policy material_versions_read on public.material_versions for select to authenticated
  using (app_private.can_read_material_version(id));
drop policy materials_read on public.materials;
create policy materials_read on public.materials for select to authenticated
  using (app_private.current_role() = 'admin' and app_private.can_read_task(task_id)
    or app_private.current_role() = 'auditor' and exists (
      select 1 from public.gv_tasks t where t.id = task_id and t.current_auditor_id = (select auth.uid())
    )
    or exists (select 1 from public.material_versions v where v.material_id = materials.id
      and app_private.can_read_material_version(v.id)));
