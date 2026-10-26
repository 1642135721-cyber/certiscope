create function app_private.can_read_task(target_task uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select app_private.current_role() = 'admin' and exists (
    select 1 from public.gv_tasks where id = target_task
  ) or app_private.current_role() = 'auditor' and exists (
    select 1 from public.gv_tasks where id = target_task and current_auditor_id = (select auth.uid())
  ) or app_private.current_role() = 'auditor' and exists (
    select 1 from public.task_participants where task_id = target_task and user_id = (select auth.uid())
  )
$$;

create function app_private.can_write_round(target_round uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.task_rounds r
    join public.gv_tasks t on t.id = r.task_id and t.current_round_id = r.id
    where r.id = target_round and r.status in ('open', 'returned') and t.archived_at is null
      and (app_private.current_role() = 'admin' or
        (app_private.current_role() = 'auditor' and t.current_auditor_id = (select auth.uid())))
  )
$$;
revoke all on function app_private.can_read_task(uuid) from public;
revoke all on function app_private.can_write_round(uuid) from public;
grant execute on function app_private.can_read_task(uuid) to authenticated;
grant execute on function app_private.can_write_round(uuid) to authenticated;

create table public.materials (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.gv_tasks(id),
  purpose text not null check (length(trim(purpose)) > 0),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique(id, task_id)
);
alter table public.materials enable row level security;

create table public.material_versions (
  id uuid primary key default gen_random_uuid(),
  material_id uuid not null,
  task_id uuid not null,
  round_id uuid not null,
  version integer not null check (version > 0),
  file_name text not null,
  mime_type text not null,
  extension text not null check (extension in ('pdf', 'doc', 'docx', 'xlsx', 'jpg', 'jpeg', 'png')),
  storage_path text not null unique,
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  byte_size bigint not null check (byte_size > 0),
  source_kind text not null default 'original' check (source_kind in ('original', 'converted', 'screenshot')),
  converted_from_version_id uuid references public.material_versions(id),
  conversion_note text,
  parse_status text not null default 'pending' check (parse_status in ('pending', 'extracted', 'needs_review', 'failed')),
  parse_reason text,
  request_key text not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  foreign key (material_id, task_id) references public.materials(id, task_id),
  foreign key (task_id, round_id) references public.task_rounds(task_id, id),
  unique(material_id, version),
  unique(task_id, request_key)
);
create index material_versions_round_idx on public.material_versions(round_id, created_at desc);
alter table public.material_versions enable row level security;

create table public.parsed_fragments (
  id uuid primary key default gen_random_uuid(),
  material_version_id uuid not null references public.material_versions(id),
  sequence integer not null check (sequence > 0),
  kind text not null,
  text_content text not null default '',
  source_location jsonb not null,
  status text not null check (status in ('extracted', 'needs_review', 'failed')),
  method text not null default 'deterministic',
  created_at timestamptz not null default now(),
  unique(material_version_id, sequence)
);
alter table public.parsed_fragments enable row level security;

create table public.fact_candidates (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.gv_tasks(id),
  round_id uuid not null references public.task_rounds(id),
  material_version_id uuid references public.material_versions(id),
  field_key text not null,
  candidate_value jsonb not null,
  unit text,
  scope text,
  source_location jsonb,
  confidence numeric check (confidence between 0 and 1),
  extraction_method text not null,
  state text not null default 'candidate' check (state in ('candidate', 'confirmed', 'invalidated')),
  created_at timestamptz not null default now()
);
create index fact_candidates_round_field_idx on public.fact_candidates(round_id, field_key);
alter table public.fact_candidates enable row level security;

create policy materials_read on public.materials for select to authenticated
  using (app_private.can_read_task(task_id));
create policy materials_insert on public.materials for insert to authenticated
  with check (created_by = (select auth.uid()) and exists (
    select 1 from public.gv_tasks t where t.id = task_id and app_private.can_write_round(t.current_round_id)
  ));
create policy material_versions_read on public.material_versions for select to authenticated
  using (app_private.can_read_task(task_id));
create policy material_versions_insert on public.material_versions for insert to authenticated
  with check (created_by = (select auth.uid()) and app_private.can_write_round(round_id)
    and storage_path like task_id::text || '/%');
create policy fragments_read on public.parsed_fragments for select to authenticated
  using (exists (select 1 from public.material_versions v where v.id = material_version_id));
create policy fragments_insert on public.parsed_fragments for insert to authenticated
  with check (exists (select 1 from public.material_versions v where v.id = material_version_id
    and v.created_by = (select auth.uid()) and app_private.can_write_round(v.round_id)));
create policy candidates_read on public.fact_candidates for select to authenticated
  using (app_private.can_read_task(task_id));
create policy candidates_insert on public.fact_candidates for insert to authenticated
  with check (app_private.can_write_round(round_id) and app_private.current_role() = 'auditor');

-- 上传后若登记失败，仅允许移除尚未登记的对象；已登记文件永不原地覆盖。
create policy gv_materials_cleanup on storage.objects for delete to authenticated
  using (bucket_id = 'gv-materials' and app_private.can_write_task_file(name)
    and not exists (select 1 from public.material_versions where storage_path = name));

grant select, insert on public.materials, public.material_versions, public.parsed_fragments, public.fact_candidates to authenticated;
