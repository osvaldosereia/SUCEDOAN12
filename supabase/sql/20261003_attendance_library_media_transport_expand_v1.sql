-- Biblioteca Rápida — amplia o transporte canônico de mídia sem reescrever a migration histórica.
-- Patch fail-closed: só altera funções se os trechos da versão 9B esperada estiverem presentes.

begin;

do $patch$
declare
  v_def text;
  v_next text;
begin
  select pg_get_functiondef('public.ops2_admin_attendance_enqueue_media_v1(uuid,text,text,text,bigint,text,text,text)'::regprocedure) into v_def;
  if v_def is null then raise exception 'enqueue_media_v1_missing'; end if;

  v_next:=replace(v_def,
    'v_media_type not in (''image'',''audio'',''document'')',
    'v_media_type not in (''image'',''audio'',''video'',''document'')');
  if v_next=v_def then raise exception 'enqueue_media_type_contract_changed'; end if;
  v_def:=v_next;

  v_next:=replace(v_def,
$old$  if (v_media_type='image' and v_mime_type not in ('image/jpeg','image/png'))
     or (v_media_type='audio' and v_mime_type not in ('audio/aac','audio/amr','audio/mpeg','audio/mp4','audio/ogg'))
     or (v_media_type='document' and v_mime_type<>'application/pdf') then$old$,
$new$  if (v_media_type='image' and v_mime_type not in ('image/jpeg','image/png'))
     or (v_media_type='audio' and v_mime_type not in ('audio/aac','audio/amr','audio/mpeg','audio/mp4','audio/ogg'))
     or (v_media_type='video' and v_mime_type not in ('video/mp4','video/3gpp'))
     or (v_media_type='document' and v_mime_type not in (
       'application/pdf','text/plain','application/msword',
       'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
       'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
       'application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation'
     )) then$new$);
  if v_next=v_def then raise exception 'enqueue_media_mime_contract_changed'; end if;
  v_def:=v_next;

  v_next:=replace(v_def,
$old$  if v_size_bytes<1 or v_size_bytes>16777216 then$old$,
$new$  if v_size_bytes<1
     or (v_media_type='image' and v_size_bytes>5242880)
     or (v_media_type in ('audio','video') and v_size_bytes>16777216)
     or (v_media_type='document' and v_size_bytes>26214400) then$new$);
  if v_next=v_def then raise exception 'enqueue_media_size_contract_changed'; end if;
  execute v_next;

  select pg_get_functiondef('public.ops2_admin_attendance_claim_media_outbox_v1(uuid)'::regprocedure) into v_def;
  if v_def is null then raise exception 'claim_media_v1_missing'; end if;

  v_next:=replace(v_def,
    'v_outbox.message_type not in (''image'',''audio'',''document'')',
    'v_outbox.message_type not in (''image'',''audio'',''video'',''document'')');
  if v_next=v_def then raise exception 'claim_media_type_contract_changed'; end if;
  v_def:=v_next;

  v_next:=replace(v_def,
$old$  if (v_outbox.message_type='image' and v_mime_type not in ('image/jpeg','image/png'))
     or (v_outbox.message_type='audio' and v_mime_type not in ('audio/aac','audio/amr','audio/mpeg','audio/mp4','audio/ogg'))
     or (v_outbox.message_type='document' and v_mime_type<>'application/pdf')
     or v_filename='' or char_length(v_filename)>240 or v_filename ~ '[[:cntrl:]\\/]'
     or v_size_bytes<1 or v_size_bytes>16777216$old$,
$new$  if (v_outbox.message_type='image' and v_mime_type not in ('image/jpeg','image/png'))
     or (v_outbox.message_type='audio' and v_mime_type not in ('audio/aac','audio/amr','audio/mpeg','audio/mp4','audio/ogg'))
     or (v_outbox.message_type='video' and v_mime_type not in ('video/mp4','video/3gpp'))
     or (v_outbox.message_type='document' and v_mime_type not in (
       'application/pdf','text/plain','application/msword',
       'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
       'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
       'application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation'
     ))
     or v_filename='' or char_length(v_filename)>240 or v_filename ~ '[[:cntrl:]\\/]'
     or v_size_bytes<1
     or (v_outbox.message_type='image' and v_size_bytes>5242880)
     or (v_outbox.message_type in ('audio','video') and v_size_bytes>16777216)
     or (v_outbox.message_type='document' and v_size_bytes>26214400)$new$);
  if v_next=v_def then raise exception 'claim_media_validation_contract_changed'; end if;
  execute v_next;

  select pg_get_functiondef('public.ops2_admin_attendance_accept_meta_media_outbound_v1(uuid,text,text,timestamptz)'::regprocedure) into v_def;
  if v_def is null then raise exception 'accept_meta_media_v1_missing'; end if;
  v_next:=replace(v_def,
    'v_outbox.message_type not in (''image'',''audio'',''document'')',
    'v_outbox.message_type not in (''image'',''audio'',''video'',''document'')');
  if v_next=v_def then raise exception 'accept_media_type_contract_changed'; end if;
  execute v_next;
end;
$patch$;

revoke all on function public.ops2_admin_attendance_enqueue_media_v1(uuid,text,text,text,bigint,text,text,text) from public,anon,authenticated;
grant execute on function public.ops2_admin_attendance_enqueue_media_v1(uuid,text,text,text,bigint,text,text,text) to service_role;
revoke all on function public.ops2_admin_attendance_claim_media_outbox_v1(uuid) from public,anon,authenticated;
grant execute on function public.ops2_admin_attendance_claim_media_outbox_v1(uuid) to service_role;
revoke all on function public.ops2_admin_attendance_accept_meta_media_outbound_v1(uuid,text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.ops2_admin_attendance_accept_meta_media_outbound_v1(uuid,text,text,timestamptz) to service_role;

commit;
