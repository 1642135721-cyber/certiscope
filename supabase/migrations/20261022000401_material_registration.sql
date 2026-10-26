create function public.register_material_version(
  p_task_id uuid,
  p_round_id uuid,
  p_material_id uuid,
  p_version_id uuid,
  p_purpose text,
  p_file_name text,
  p_mime_type text,
  p_extension text,
  p_storage_path text,
  p_sha256 text,
  p_byte_size bigint,
  p_source_kind text,
  p_converted_from_version_id uuid,
  p_conversion_note text,
  p_parse_status text,
  p_parse_reason text,
  p_fragments jsonb,
  p_request_key text
)
returns table(material_id uuid, material_version_id uuid, version integer)
language plpgsql security invoker set search_path = '' as $$
declare
  target_material uuid;
  next_version integer;
  existing_version public.material_versions%rowtype;
begin
  if not app_private.can_write_round(p_round_id) or not exists (
    select 1 from public.task_rounds where id = p_round_id and task_id = p_task_id
  ) then
    raise exception '当前轮次不可写入';
  end if;
  if p_request_key is null or length(p_request_key) not between 1 and 128 then
    raise exception '请求标识无效';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_task_id::text || ':' || p_request_key, 0));
  select * into existing_version from public.material_versions
    where task_id = p_task_id and request_key = p_request_key;
  if found then
    return query select existing_version.material_id, existing_version.id, existing_version.version;
    return;
  end if;
  if not exists (select 1 from storage.objects where bucket_id = 'gv-materials' and name = p_storage_path) then
    raise exception '文件未上传成功';
  end if;
  if p_storage_path not like p_task_id::text || '/' || p_round_id::text || '/%' then
    raise exception '文件路径与任务轮次不匹配';
  end if;
  if p_source_kind = 'converted' and (
    p_converted_from_version_id is null or coalesce(trim(p_conversion_note), '') = ''
  ) then
    raise exception '转换件必须注明源文件版本和转换方式';
  end if;
  if p_converted_from_version_id is not null and not exists (
    select 1 from public.material_versions where id = p_converted_from_version_id and task_id = p_task_id
  ) then
    raise exception '转换源文件不存在或不属于当前任务';
  end if;
  if p_material_id is null then
    insert into public.materials (task_id, purpose, created_by)
      values (p_task_id, trim(p_purpose), (select auth.uid())) returning id into target_material;
  else
    select id into target_material from public.materials
      where id = p_material_id and task_id = p_task_id;
    if target_material is null then raise exception '材料不存在或无权访问'; end if;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(target_material::text, 0));
  select coalesce(max(v.version), 0) + 1 into next_version
    from public.material_versions v where v.material_id = target_material;
  insert into public.material_versions (
    id, material_id, task_id, round_id, version, file_name, mime_type, extension,
    storage_path, sha256, byte_size, source_kind, converted_from_version_id,
    conversion_note, parse_status, parse_reason, request_key, created_by
  ) values (
    p_version_id, target_material, p_task_id, p_round_id, next_version,
    p_file_name, p_mime_type, p_extension, p_storage_path, p_sha256, p_byte_size,
    p_source_kind, p_converted_from_version_id, p_conversion_note,
    p_parse_status, p_parse_reason, p_request_key, (select auth.uid())
  );
  insert into public.parsed_fragments (
    material_version_id, sequence, kind, text_content, source_location, status, method
  ) select
    p_version_id, item.ordinality::integer,
    item.value->>'kind', coalesce(item.value->>'text', ''),
    item.value->'source', item.value->>'status', 'deterministic'
  from jsonb_array_elements(coalesce(p_fragments, '[]'::jsonb)) with ordinality as item(value, ordinality);
  return query select target_material, p_version_id, next_version;
end;
$$;
revoke all on function public.register_material_version(uuid, uuid, uuid, uuid, text, text, text, text, text, text, bigint, text, uuid, text, text, text, jsonb, text) from public;
grant execute on function public.register_material_version(uuid, uuid, uuid, uuid, text, text, text, text, text, text, bigint, text, uuid, text, text, text, jsonb, text) to authenticated;
