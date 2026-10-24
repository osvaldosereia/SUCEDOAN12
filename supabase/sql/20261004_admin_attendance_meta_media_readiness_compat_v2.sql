-- Hotfix v2: reconhecer evidência histórica de canário de mídia no readiness.
-- Antes de meta_media_canary existir, os envios controlados usavam metadata.meta_canary=true.
-- O fallback abaixo NÃO amplia destinos: a evidência só conta se o destinatário ainda
-- pertencer à allowlist estrita meta_media_canary_to_e164 vigente do canal.

create or replace function public.ops2_attendance_media_live_readiness_v1(p_whatsapp_account_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_runtime public.whatsapp_channel_runtime_v1%rowtype;
  v_image_count integer:=0;
  v_audio_count integer:=0;
  v_document_count integer:=0;
  v_duplicate_wamid_count integer:=0;
  v_unhealthy_queue_count integer:=0;
  v_ready boolean:=false;
begin
  if p_whatsapp_account_id is null then
    return jsonb_build_object('ok',false,'ready',false,'error','whatsapp_account_required');
  end if;

  select r.* into v_runtime
  from public.whatsapp_channel_runtime_v1 r
  where r.whatsapp_account_id=p_whatsapp_account_id
    and r.send_enabled=true
    and r.human_send_enabled=true
    and r.homologated_at is not null
    and r.outbound_provider='meta';

  if not found then
    return jsonb_build_object('ok',true,'ready',false,'reason','human_send_not_homologated');
  end if;

  with evidence as (
    select o.message_type,o.provider_message_id
    from public.whatsapp_outbox_v1 o
    join public.whatsapp_messages_v1 m on m.id=o.message_id
    where o.whatsapp_account_id=p_whatsapp_account_id
      and o.purpose='human_attendance'
      and o.provider='meta'
      and o.message_type in ('image','audio','document')
      and o.status='sent'
      and o.provider_message_id is not null
      and m.provider='meta'
      and m.direction='outbound'
      and m.provider_message_id=o.provider_message_id
      and m.status_current in ('sent','delivered','read')
      and lower(coalesce(o.metadata->>'meta_media_canary',o.metadata->>'meta_canary','false'))='true'
      and exists (
        select 1
        from jsonb_array_elements_text(
          case
            when jsonb_typeof(v_runtime.metadata->'meta_media_canary_to_e164')='array'
              then v_runtime.metadata->'meta_media_canary_to_e164'
            else '[]'::jsonb
          end
        ) allowed(value)
        where public.canonical_whatsapp_e164_br_v2(allowed.value)
              = public.canonical_whatsapp_e164_br_v2(o.to_phone_e164)
      )
  )
  select
    count(*) filter (where message_type='image')::integer,
    count(*) filter (where message_type='audio')::integer,
    count(*) filter (where message_type='document')::integer
  into v_image_count,v_audio_count,v_document_count
  from evidence;

  select count(*)::integer into v_duplicate_wamid_count
  from (
    select o.provider_message_id
    from public.whatsapp_outbox_v1 o
    where o.whatsapp_account_id=p_whatsapp_account_id
      and o.purpose='human_attendance'
      and o.provider='meta'
      and o.message_type in ('image','audio','document')
      and o.status='sent'
      and o.provider_message_id is not null
      and lower(coalesce(o.metadata->>'meta_media_canary',o.metadata->>'meta_canary','false'))='true'
      and exists (
        select 1
        from jsonb_array_elements_text(
          case
            when jsonb_typeof(v_runtime.metadata->'meta_media_canary_to_e164')='array'
              then v_runtime.metadata->'meta_media_canary_to_e164'
            else '[]'::jsonb
          end
        ) allowed(value)
        where public.canonical_whatsapp_e164_br_v2(allowed.value)
              = public.canonical_whatsapp_e164_br_v2(o.to_phone_e164)
      )
    group by o.provider_message_id
    having count(*)>1
  ) duplicated;

  select count(*)::integer into v_unhealthy_queue_count
  from public.whatsapp_outbox_v1 o
  where o.whatsapp_account_id=p_whatsapp_account_id
    and o.purpose='human_attendance'
    and o.provider='meta'
    and o.message_type in ('image','audio','document')
    and o.status in ('queued','claimed','failed')
    and o.created_at>=now()-interval '24 hours';

  v_ready:=
    lower(coalesce(v_runtime.metadata->>'meta_media_canary_enabled','false'))='true'
    and v_image_count>0
    and v_audio_count>0
    and v_document_count>0
    and v_duplicate_wamid_count=0
    and v_unhealthy_queue_count=0;

  return jsonb_build_object(
    'ok',true,
    'ready',v_ready,
    'evidence',jsonb_build_object(
      'image',v_image_count,
      'audio',v_audio_count,
      'document',v_document_count,
      'duplicate_wamid',v_duplicate_wamid_count,
      'unhealthy_queue_24h',v_unhealthy_queue_count
    ),
    'requires',jsonb_build_array(
      'strict_media_canary_enabled',
      'image_meta_canary_with_wamid_and_status',
      'audio_meta_canary_with_wamid_and_status',
      'document_meta_canary_with_wamid_and_status',
      'no_duplicate_wamid',
      'clean_media_queue_24h'
    )
  );
end;
$$;

revoke all on function public.ops2_attendance_media_live_readiness_v1(uuid) from public,anon,authenticated;
grant execute on function public.ops2_attendance_media_live_readiness_v1(uuid) to service_role;
