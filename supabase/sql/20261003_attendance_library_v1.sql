-- Dona Antônia — Biblioteca Rápida do Atendimento v1
-- Catálogo privado compartilhado pelos canais 0975/1018.

begin;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values (
  'attendance-library-v1',
  'attendance-library-v1',
  false,
  26214400,
  array[
    'image/jpeg','image/png',
    'video/mp4','video/3gpp',
    'audio/aac','audio/amr','audio/mpeg','audio/mp4','audio/ogg',
    'application/pdf','text/plain','application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  ]::text[]
)
on conflict (id) do update set
  public=false,
  file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types,
  updated_at=now();

create table if not exists public.attendance_library_items_v1 (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  media_kind text not null check (media_kind in ('image','video','audio','document')),
  mime_type text not null,
  storage_path text not null unique,
  thumbnail_path text null unique,
  original_filename text not null,
  original_size_bytes bigint null check (original_size_bytes is null or original_size_bytes > 0),
  stored_size_bytes bigint null check (stored_size_bytes is null or stored_size_bytes > 0),
  width integer null check (width is null or width > 0),
  height integer null check (height is null or height > 0),
  duration_seconds numeric null check (duration_seconds is null or duration_seconds >= 0),
  category text null,
  tags text[] not null default '{}'::text[],
  sort_order integer not null default 0,
  upload_status text not null default 'pending' check (upload_status in ('pending','ready','failed')),
  upload_expires_at timestamptz null,
  is_active boolean not null default false,
  created_by uuid not null,
  updated_by uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz null,
  deleted_by uuid null
);

create index if not exists attendance_library_items_v1_active_created_idx
  on public.attendance_library_items_v1(is_active,created_at desc);
create index if not exists attendance_library_items_v1_kind_active_created_idx
  on public.attendance_library_items_v1(media_kind,is_active,created_at desc);
create index if not exists attendance_library_items_v1_category_active_created_idx
  on public.attendance_library_items_v1(category,is_active,created_at desc);
create index if not exists attendance_library_items_v1_upload_status_idx
  on public.attendance_library_items_v1(upload_status,upload_expires_at);

alter table public.attendance_library_items_v1 enable row level security;
revoke all on table public.attendance_library_items_v1 from public;
revoke all on table public.attendance_library_items_v1 from anon;
revoke all on table public.attendance_library_items_v1 from authenticated;
grant select,insert,update,delete on table public.attendance_library_items_v1 to service_role;

create table if not exists public.attendance_library_audit_v1 (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null,
  item_id uuid null references public.attendance_library_items_v1(id) on delete set null,
  conversation_id uuid null references public.conversations(id) on delete set null,
  whatsapp_account_id uuid null references public.whatsapp_accounts(id) on delete set null,
  action text not null,
  result text not null,
  error_code text null,
  outbox_id uuid null references public.whatsapp_outbox_v1(id) on delete set null,
  message_id uuid null references public.whatsapp_messages_v1(id) on delete set null,
  provider_message_id text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists attendance_library_audit_v1_item_created_idx
  on public.attendance_library_audit_v1(item_id,created_at desc);
create index if not exists attendance_library_audit_v1_conversation_created_idx
  on public.attendance_library_audit_v1(conversation_id,created_at desc);

alter table public.attendance_library_audit_v1 enable row level security;
revoke all on table public.attendance_library_audit_v1 from public;
revoke all on table public.attendance_library_audit_v1 from anon;
revoke all on table public.attendance_library_audit_v1 from authenticated;
grant select,insert on table public.attendance_library_audit_v1 to service_role;

create or replace function public.ops2_admin_attendance_library_reserve_v1(
  p_title text,
  p_media_kind text,
  p_mime_type text,
  p_original_filename text,
  p_original_size_bytes bigint,
  p_category text,
  p_tags text[],
  p_admin_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_id uuid:=gen_random_uuid();
  v_title text:=trim(coalesce(p_title,''));
  v_kind text:=lower(trim(coalesce(p_media_kind,'')));
  v_mime text:=lower(trim(coalesce(p_mime_type,'')));
  v_filename text:=trim(coalesce(p_original_filename,''));
  v_ext text;
  v_storage_path text;
  v_thumbnail_path text;
  v_category text:=nullif(trim(coalesce(p_category,'')),'');
  v_tags text[]:=coalesce(p_tags,'{}'::text[]);
  v_expires timestamptz:=now()+interval '2 hours';
begin
  if p_admin_user_id is null or not exists (
    select 1 from public.admin_users a where a.user_id=p_admin_user_id and a.is_active=true
  ) then
    return jsonb_build_object('ok',false,'error','admin_not_authorized');
  end if;
  if v_title='' then return jsonb_build_object('ok',false,'error','library_title_required'); end if;
  if length(v_title)>120 then return jsonb_build_object('ok',false,'error','library_title_too_long'); end if;
  if v_filename='' then return jsonb_build_object('ok',false,'error','library_filename_required'); end if;
  if p_original_size_bytes is null or p_original_size_bytes<1 or p_original_size_bytes>52428800 then
    return jsonb_build_object('ok',false,'error','library_original_size_invalid');
  end if;
  if v_kind not in ('image','video','audio','document') then
    return jsonb_build_object('ok',false,'error','library_media_kind_invalid');
  end if;

  if v_kind='image' and v_mime not in ('image/jpeg','image/png') then
    return jsonb_build_object('ok',false,'error','library_mime_invalid');
  elsif v_kind='video' and v_mime not in ('video/mp4','video/3gpp') then
    return jsonb_build_object('ok',false,'error','library_mime_invalid');
  elsif v_kind='audio' and v_mime not in ('audio/aac','audio/amr','audio/mpeg','audio/mp4','audio/ogg') then
    return jsonb_build_object('ok',false,'error','library_mime_invalid');
  elsif v_kind='document' and v_mime not in (
    'application/pdf','text/plain','application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation'
  ) then
    return jsonb_build_object('ok',false,'error','library_mime_invalid');
  end if;

  v_ext:=case v_mime
    when 'image/jpeg' then 'jpg'
    when 'image/png' then 'png'
    when 'video/mp4' then 'mp4'
    when 'video/3gpp' then '3gp'
    when 'audio/aac' then 'aac'
    when 'audio/amr' then 'amr'
    when 'audio/mpeg' then 'mp3'
    when 'audio/mp4' then 'm4a'
    when 'audio/ogg' then 'ogg'
    when 'application/pdf' then 'pdf'
    when 'text/plain' then 'txt'
    when 'application/msword' then 'doc'
    when 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' then 'docx'
    when 'application/vnd.ms-excel' then 'xls'
    when 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' then 'xlsx'
    when 'application/vnd.ms-powerpoint' then 'ppt'
    when 'application/vnd.openxmlformats-officedocument.presentationml.presentation' then 'pptx'
    else null
  end;
  if v_ext is null then return jsonb_build_object('ok',false,'error','library_mime_invalid'); end if;

  v_storage_path:='items/'||v_id::text||'/asset.'||v_ext;
  v_thumbnail_path:=case when v_kind='image' then 'items/'||v_id::text||'/thumb.jpg' else null end;

  insert into public.attendance_library_items_v1(
    id,title,media_kind,mime_type,storage_path,thumbnail_path,original_filename,original_size_bytes,
    category,tags,upload_status,upload_expires_at,is_active,created_by,updated_by
  ) values (
    v_id,v_title,v_kind,v_mime,v_storage_path,v_thumbnail_path,left(v_filename,255),p_original_size_bytes,
    v_category,v_tags,'pending',v_expires,false,p_admin_user_id,p_admin_user_id
  );

  insert into public.attendance_library_audit_v1(admin_user_id,item_id,action,result,metadata)
  values (p_admin_user_id,v_id,'item_create','success',jsonb_build_object('media_kind',v_kind,'mime_type',v_mime));

  return jsonb_build_object(
    'ok',true,
    'item_id',v_id,
    'storage_path',v_storage_path,
    'thumbnail_path',v_thumbnail_path,
    'upload_expires_at',v_expires
  );
end;
$function$;

create or replace function public.ops2_admin_attendance_library_finalize_v1(
  p_item_id uuid,
  p_stored_size_bytes bigint,
  p_width integer,
  p_height integer,
  p_duration_seconds numeric,
  p_admin_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_item public.attendance_library_items_v1%rowtype;
  v_object record;
  v_thumb record;
  v_actual_size bigint;
  v_actual_mime text;
begin
  if p_admin_user_id is null or not exists (
    select 1 from public.admin_users a where a.user_id=p_admin_user_id and a.is_active=true
  ) then
    return jsonb_build_object('ok',false,'error','admin_not_authorized');
  end if;
  if p_item_id is null then return jsonb_build_object('ok',false,'error','library_item_required'); end if;

  select * into v_item from public.attendance_library_items_v1 where id=p_item_id for update;
  if not found then return jsonb_build_object('ok',false,'error','library_item_not_found'); end if;
  if v_item.deleted_at is not null then return jsonb_build_object('ok',false,'error','library_item_inactive'); end if;
  if v_item.upload_status<>'pending' then return jsonb_build_object('ok',false,'error','library_upload_not_pending'); end if;
  if v_item.upload_expires_at is null or v_item.upload_expires_at<now() then
    update public.attendance_library_items_v1 set upload_status='failed',updated_at=now(),updated_by=p_admin_user_id where id=p_item_id;
    return jsonb_build_object('ok',false,'error','library_upload_expired');
  end if;

  select o.name,o.metadata into v_object
  from storage.objects o
  where o.bucket_id='attendance-library-v1' and o.name=v_item.storage_path
  limit 1;
  if not found then return jsonb_build_object('ok',false,'error','library_storage_object_missing'); end if;

  v_actual_size:=case
    when coalesce(v_object.metadata->>'size','') ~ '^[0-9]+$' then (v_object.metadata->>'size')::bigint
    else 0
  end;
  v_actual_mime:=lower(coalesce(v_object.metadata->>'mimetype',v_object.metadata->>'contentType',v_object.metadata->>'content-type',''));

  if v_actual_size<1 or v_actual_size>26214400 then return jsonb_build_object('ok',false,'error','library_stored_size_invalid'); end if;
  if p_stored_size_bytes is null or p_stored_size_bytes<>v_actual_size then return jsonb_build_object('ok',false,'error','library_stored_size_mismatch'); end if;
  if v_actual_mime<>v_item.mime_type then return jsonb_build_object('ok',false,'error','library_storage_mime_mismatch'); end if;

  if v_item.thumbnail_path is not null then
    select o.name,o.metadata into v_thumb
    from storage.objects o
    where o.bucket_id='attendance-library-v1' and o.name=v_item.thumbnail_path
    limit 1;
    if not found then return jsonb_build_object('ok',false,'error','library_thumbnail_missing'); end if;
  end if;

  update public.attendance_library_items_v1
  set stored_size_bytes=v_actual_size,
      width=case when p_width is null or p_width<1 then null else p_width end,
      height=case when p_height is null or p_height<1 then null else p_height end,
      duration_seconds=case when p_duration_seconds is null or p_duration_seconds<0 then null else p_duration_seconds end,
      upload_status='ready',upload_expires_at=null,is_active=true,updated_at=now(),updated_by=p_admin_user_id
  where id=p_item_id
  returning * into v_item;

  insert into public.attendance_library_audit_v1(admin_user_id,item_id,action,result,metadata)
  values (p_admin_user_id,p_item_id,'item_upload_complete','success',jsonb_build_object('stored_size_bytes',v_actual_size));

  return jsonb_build_object('ok',true,'item',to_jsonb(v_item));
end;
$function$;

create or replace function public.ops2_admin_attendance_library_update_v1(
  p_item_id uuid,
  p_title text,
  p_category text,
  p_tags text[],
  p_sort_order integer,
  p_admin_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_item public.attendance_library_items_v1%rowtype;
  v_title text:=trim(coalesce(p_title,''));
begin
  if p_admin_user_id is null or not exists (
    select 1 from public.admin_users a where a.user_id=p_admin_user_id and a.is_active=true
  ) then return jsonb_build_object('ok',false,'error','admin_not_authorized'); end if;
  if v_title='' then return jsonb_build_object('ok',false,'error','library_title_required'); end if;
  if length(v_title)>120 then return jsonb_build_object('ok',false,'error','library_title_too_long'); end if;

  update public.attendance_library_items_v1
  set title=v_title,category=nullif(trim(coalesce(p_category,'')),''),tags=coalesce(p_tags,'{}'::text[]),
      sort_order=coalesce(p_sort_order,0),updated_by=p_admin_user_id,updated_at=now()
  where id=p_item_id and is_active=true and upload_status='ready' and deleted_at is null
  returning * into v_item;
  if not found then return jsonb_build_object('ok',false,'error','library_item_inactive'); end if;

  insert into public.attendance_library_audit_v1(admin_user_id,item_id,action,result)
  values (p_admin_user_id,p_item_id,'item_update','success');
  return jsonb_build_object('ok',true,'item',to_jsonb(v_item));
end;
$function$;

create or replace function public.ops2_admin_attendance_library_deactivate_v1(
  p_item_id uuid,
  p_admin_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_id uuid;
begin
  if p_admin_user_id is null or not exists (
    select 1 from public.admin_users a where a.user_id=p_admin_user_id and a.is_active=true
  ) then return jsonb_build_object('ok',false,'error','admin_not_authorized'); end if;

  update public.attendance_library_items_v1
  set is_active=false,deleted_at=coalesce(deleted_at,now()),deleted_by=p_admin_user_id,updated_by=p_admin_user_id,updated_at=now()
  where id=p_item_id and deleted_at is null
  returning id into v_id;
  if v_id is null then return jsonb_build_object('ok',false,'error','library_item_not_found'); end if;

  insert into public.attendance_library_audit_v1(admin_user_id,item_id,action,result)
  values (p_admin_user_id,p_item_id,'item_deactivate','success');
  return jsonb_build_object('ok',true,'item_id',v_id);
end;
$function$;

create or replace function public.ops2_admin_attendance_library_audit_v1(
  p_admin_user_id uuid,
  p_item_id uuid,
  p_conversation_id uuid,
  p_whatsapp_account_id uuid,
  p_action text,
  p_result text,
  p_error_code text,
  p_outbox_id uuid,
  p_message_id uuid,
  p_provider_message_id text,
  p_metadata jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_id uuid;
begin
  if p_admin_user_id is null or not exists (
    select 1 from public.admin_users a where a.user_id=p_admin_user_id and a.is_active=true
  ) then return jsonb_build_object('ok',false,'error','admin_not_authorized'); end if;
  if trim(coalesce(p_action,''))='' then return jsonb_build_object('ok',false,'error','audit_action_required'); end if;
  if trim(coalesce(p_result,''))='' then return jsonb_build_object('ok',false,'error','audit_result_required'); end if;

  insert into public.attendance_library_audit_v1(
    admin_user_id,item_id,conversation_id,whatsapp_account_id,action,result,error_code,outbox_id,message_id,provider_message_id,metadata
  ) values (
    p_admin_user_id,p_item_id,p_conversation_id,p_whatsapp_account_id,left(trim(p_action),80),left(trim(p_result),40),
    nullif(left(trim(coalesce(p_error_code,'')),180),''),p_outbox_id,p_message_id,nullif(left(trim(coalesce(p_provider_message_id,'')),240),''),coalesce(p_metadata,'{}'::jsonb)
  ) returning id into v_id;
  return jsonb_build_object('ok',true,'audit_id',v_id);
end;
$function$;

revoke all on function public.ops2_admin_attendance_library_reserve_v1(text,text,text,text,bigint,text,text[],uuid) from public;
revoke all on function public.ops2_admin_attendance_library_reserve_v1(text,text,text,text,bigint,text,text[],uuid) from anon;
revoke all on function public.ops2_admin_attendance_library_reserve_v1(text,text,text,text,bigint,text,text[],uuid) from authenticated;
grant execute on function public.ops2_admin_attendance_library_reserve_v1(text,text,text,text,bigint,text,text[],uuid) to service_role;

revoke all on function public.ops2_admin_attendance_library_finalize_v1(uuid,bigint,integer,integer,numeric,uuid) from public;
revoke all on function public.ops2_admin_attendance_library_finalize_v1(uuid,bigint,integer,integer,numeric,uuid) from anon;
revoke all on function public.ops2_admin_attendance_library_finalize_v1(uuid,bigint,integer,integer,numeric,uuid) from authenticated;
grant execute on function public.ops2_admin_attendance_library_finalize_v1(uuid,bigint,integer,integer,numeric,uuid) to service_role;

revoke all on function public.ops2_admin_attendance_library_update_v1(uuid,text,text,text[],integer,uuid) from public;
revoke all on function public.ops2_admin_attendance_library_update_v1(uuid,text,text,text[],integer,uuid) from anon;
revoke all on function public.ops2_admin_attendance_library_update_v1(uuid,text,text,text[],integer,uuid) from authenticated;
grant execute on function public.ops2_admin_attendance_library_update_v1(uuid,text,text,text[],integer,uuid) to service_role;

revoke all on function public.ops2_admin_attendance_library_deactivate_v1(uuid,uuid) from public;
revoke all on function public.ops2_admin_attendance_library_deactivate_v1(uuid,uuid) from anon;
revoke all on function public.ops2_admin_attendance_library_deactivate_v1(uuid,uuid) from authenticated;
grant execute on function public.ops2_admin_attendance_library_deactivate_v1(uuid,uuid) to service_role;

revoke all on function public.ops2_admin_attendance_library_audit_v1(uuid,uuid,uuid,uuid,text,text,text,uuid,uuid,text,jsonb) from public;
revoke all on function public.ops2_admin_attendance_library_audit_v1(uuid,uuid,uuid,uuid,text,text,text,uuid,uuid,text,jsonb) from anon;
revoke all on function public.ops2_admin_attendance_library_audit_v1(uuid,uuid,uuid,uuid,text,text,text,uuid,uuid,text,jsonb) from authenticated;
grant execute on function public.ops2_admin_attendance_library_audit_v1(uuid,uuid,uuid,uuid,text,text,text,uuid,uuid,text,jsonb) to service_role;

commit;
