-- 项目建档及其来源文件在同一事务内完成，重试使用请求标识返回原项目。
create table public.project_record_create_requests (
  actor_id uuid not null references auth.users(id),
  request_key text not null check (length(request_key) between 1 and 128),
  project_id uuid not null references public.projects(id),
  created_at timestamptz not null default now(),
  primary key (actor_id, request_key)
);
alter table public.project_record_create_requests enable row level security;
create policy project_record_request_admin_read on public.project_record_create_requests
  for select to authenticated using (app_private.current_role() = 'admin' and actor_id = (select auth.uid()));
create policy project_record_request_admin_insert on public.project_record_create_requests
  for insert to authenticated with check (app_private.current_role() = 'admin' and actor_id = (select auth.uid()));
grant select, insert on public.project_record_create_requests to authenticated;

create function public.create_project_record(
  p_name text, p_project_type text, p_location text, p_area_value numeric,
  p_area_unit text, p_target_level text, p_source_files jsonb, p_request_key text
) returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  v_project_id uuid;
  v_file jsonb;
  v_count integer;
begin
  if app_private.current_role() <> 'admin' then raise exception '仅审核管理员可创建项目'; end if;
  if coalesce(trim(p_name), '') = '' or coalesce(trim(p_project_type), '') = ''
    or coalesce(trim(p_location), '') = '' or p_area_value is null or p_area_value <= 0
    or coalesce(trim(p_area_unit), '') = '' or coalesce(trim(p_target_level), '') = '' then
    raise exception '请核对项目名称、类型、地点、面积和申报等级';
  end if;
  if coalesce(length(p_request_key), 0) < 1 or length(p_request_key) > 128 then
    raise exception '请求标识无效';
  end if;
  if p_source_files is null or jsonb_typeof(p_source_files) <> 'array' then
    raise exception '来源文件清单格式无效';
  end if;
  v_count := jsonb_array_length(p_source_files);
  if v_count > 200 then raise exception '单次建档最多登记 200 份材料'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended((select auth.uid())::text || ':' || p_request_key, 0));
  select project_id into v_project_id from public.project_record_create_requests
    where actor_id = (select auth.uid()) and request_key = p_request_key;
  if found then return v_project_id; end if;
  for v_file in select value from jsonb_array_elements(p_source_files) loop
    if coalesce(trim(v_file->>'path'), '') = '' or coalesce(trim(v_file->>'name'), '') = ''
      or split_part(v_file->>'path', '/', 1) <> (select auth.uid())::text
      or not exists (select 1 from storage.objects where bucket_id = 'gv-intake' and name = v_file->>'path') then
      raise exception '来源文件不存在或无权访问';
    end if;
  end loop;
  insert into public.projects(name, project_type, location, area_value, area_unit, target_level,
    intake_file_path, confirmed_by, created_by)
    values (trim(p_name), trim(p_project_type), trim(p_location), p_area_value,
      trim(p_area_unit), trim(p_target_level), p_source_files->0->>'path',
      (select auth.uid()), (select auth.uid())) returning id into v_project_id;
  insert into public.project_source_files(project_id, file_name, storage_path, parse_status, created_by)
    select v_project_id, trim(value->>'name'), value->>'path',
      case when value->>'parseStatus' in ('extracted', 'needs_review', 'failed')
        then value->>'parseStatus' else 'pending' end,
      (select auth.uid())
    from jsonb_array_elements(p_source_files);
  insert into public.project_record_create_requests(actor_id, request_key, project_id)
    values ((select auth.uid()), p_request_key, v_project_id);
  return v_project_id;
end;
$$;
revoke all on function public.create_project_record(text, text, text, numeric, text, text, jsonb, text) from public;
grant execute on function public.create_project_record(text, text, text, numeric, text, text, jsonb, text) to authenticated;
