-- Graduação controlada do outbound de mídia Meta: canário -> live.
-- O trigger continua fail-closed. Modo live NÃO remove gates de janela de 24h,
-- homologação humana, provider Meta, rate limit, idempotência ou destino server-side;
-- esses gates permanecem nos RPCs enqueue/claim. Aqui apenas deixamos de exigir
-- allowlist de canário quando meta_media_live_enabled=true.

create or replace function public.ops2_admin_attendance_media_canary_guard_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_runtime public.whatsapp_channel_runtime_v1%rowtype;
  v_phone text;
  v_live boolean:=false;
  v_canary boolean:=false;
begin
  if new.purpose='human_attendance'
     and new.provider='meta'
     and new.message_type in ('image','audio','video','document')
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

    v_live:=lower(coalesce(v_runtime.metadata->>'meta_media_live_enabled','false'))='true';
    v_canary:=lower(coalesce(v_runtime.metadata->>'meta_media_canary_enabled','false'))='true';
    v_phone:=public.canonical_whatsapp_e164_br_v2(new.to_phone_e164);

    if v_phone is null then
      raise exception using errcode='P0001',message='meta_canary_destination_blocked';
    end if;

    if not v_live then
      if not v_canary then
        raise exception using errcode='P0001',message='meta_media_canary_not_enabled';
      end if;

      if not exists (
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
    end if;

    new.metadata:=coalesce(new.metadata,'{}'::jsonb)||jsonb_build_object(
      'meta_media_mode',case when v_live then 'live' else 'canary' end,
      'meta_media_live',v_live,
      'meta_media_canary',not v_live and v_canary
    );
  end if;

  return new;
end;
$$;

revoke all on function public.ops2_admin_attendance_media_canary_guard_v1() from public,anon,authenticated;

-- Os dois números oficiais já passaram pelo envio controlado de mídia.
-- A allowlist histórica permanece no metadata para rollback imediato a canário.
update public.whatsapp_channel_runtime_v1 r
set metadata=jsonb_set(
  jsonb_set(
    coalesce(r.metadata,'{}'::jsonb),
    '{meta_media_live_enabled}',
    to_jsonb(true),
    true
  ),
  '{meta_media_canary_enabled}',
  to_jsonb(false),
  true
)
from public.whatsapp_accounts a
where a.id=r.whatsapp_account_id
  and a.is_active=true
  and a.phone_e164 in ('+5565998150975','+5565984491018');
