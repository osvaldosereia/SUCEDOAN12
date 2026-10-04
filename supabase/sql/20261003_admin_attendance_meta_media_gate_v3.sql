-- Task 9B safety v3 — canário de mídia independente do canário global de atendimento.
-- Mantém texto humano já homologado sem abrir imagem/áudio/documento para clientes reais.

create or replace function public.ops2_admin_attendance_media_canary_guard_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_runtime public.whatsapp_channel_runtime_v1%rowtype;
  v_phone text;
begin
  if new.purpose='human_attendance'
     and new.provider='meta'
     and new.message_type in ('image','audio','document')
     and (
       tg_op='INSERT'
       or (tg_op='UPDATE' and old.status is distinct from new.status and new.status='claimed')
     ) then

    select r.* into v_runtime
    from public.whatsapp_channel_runtime_v1 r
    where r.whatsapp_account_id=new.whatsapp_account_id
      and r.send_enabled=true
      and r.human_send_enabled=true
      and r.homologated_at is not null
      and r.outbound_provider='meta';

    if not found then
      raise exception using errcode='P0001',message='human_send_not_homologated';
    end if;

    if lower(coalesce(v_runtime.metadata->>'meta_media_canary_enabled','false'))<>'true' then
      raise exception using errcode='P0001',message='meta_media_canary_not_enabled';
    end if;

    v_phone:=public.canonical_whatsapp_e164_br_v2(new.to_phone_e164);
    if v_phone is null or not exists (
      select 1
      from jsonb_array_elements_text(
        case
          when jsonb_typeof(v_runtime.metadata->'meta_media_canary_to_e164')='array'
            then v_runtime.metadata->'meta_media_canary_to_e164'
          else '[]'::jsonb
        end
      ) as allowed(value)
      where public.canonical_whatsapp_e164_br_v2(allowed.value)=v_phone
    ) then
      raise exception using errcode='P0001',message='meta_canary_destination_blocked';
    end if;

    new.metadata:=coalesce(new.metadata,'{}'::jsonb)||jsonb_build_object(
      'meta_canary',true,
      'meta_media_canary',true
    );
  end if;

  return new;
end;
$$;

revoke all on function public.ops2_admin_attendance_media_canary_guard_v1() from public,anon,authenticated;
