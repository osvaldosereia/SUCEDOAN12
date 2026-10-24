-- Liberacao pontual de documentos PDF/arquivo pelo atendimento humano Meta, somente canal 0975.
-- Nao modifica o modo global de midia, audio, mensagens de texto ou o canal 1018.
-- Destinatario continua exclusivamente derivado da conversa autenticada; a janela de 24h,
-- tamanho/MIME, homologacao do canal e a fila idempotente continuam obrigatorios.
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
  v_image_live boolean:=false;
  v_document_live boolean:=false;
  v_readiness jsonb;
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

    v_live:=lower(coalesce(v_runtime.metadata->>'meta_media_live_enabled','false'))='true';
    v_canary:=lower(coalesce(v_runtime.metadata->>'meta_media_canary_enabled','false'))='true';
    v_image_live:=new.message_type='image'
      and lower(coalesce(v_runtime.metadata->>'meta_image_live_enabled','false'))='true';
    v_document_live:=new.message_type='document'
      and lower(coalesce(v_runtime.metadata->>'meta_document_live_enabled','false'))='true';
    v_phone:=public.canonical_whatsapp_e164_br_v2(new.to_phone_e164);

    if v_phone is null then
      raise exception using errcode='P0001',message='meta_canary_destination_blocked';
    end if;

    if v_live then
      v_readiness:=public.ops2_attendance_media_live_readiness_v1(new.whatsapp_account_id);
      if coalesce((v_readiness->>'ready')::boolean,false) is not true then
        raise exception using errcode='P0001',message='meta_media_live_not_ready';
      end if;
    elsif v_image_live or v_document_live then
      -- Graduacao independente de imagem/documento, sem abrir audio.
      -- Validacoes de destino, MIME/tamanho, janela e transporte ja ocorrem
      -- no caminho de enqueue/claim e no gateway Meta existente.
      null;
    else
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
      'meta_media_mode',case when v_live or v_image_live or v_document_live then 'live' else 'canary' end,
      'meta_media_live',v_live,
      'meta_image_live',v_image_live,
      'meta_document_live',v_document_live,
      'meta_media_canary',not (v_live or v_image_live or v_document_live) and v_canary
    );
  end if;

  return new;
end;
$$;

revoke all on function public.ops2_admin_attendance_media_canary_guard_v1() from public,anon,authenticated;

-- Ativa documento live apenas no 0975 e SOMENTE quando a readiness real
-- previamente medida comprovar envio de imagem, audio e documento pelo canario,
-- sem duplicidade de WAMID ou fila de midia pendente nas ultimas 24 horas.
do $$
declare
  v_account_id uuid;
  v_readiness jsonb;
begin
  select a.id into v_account_id
  from public.whatsapp_accounts a
  join public.whatsapp_channel_runtime_v1 r on r.whatsapp_account_id=a.id
  where a.phone_e164='+5565998150975'
    and a.is_active=true
    and r.send_enabled=true
    and r.human_send_enabled=true
    and r.homologated_at is not null
    and r.outbound_provider='meta';

  if v_account_id is null then
    raise exception 'document_live_0975_channel_not_ready';
  end if;

  v_readiness:=public.ops2_attendance_media_live_readiness_v1(v_account_id);
  if coalesce((v_readiness->>'ready')::boolean,false) is not true then
    raise exception 'document_live_0975_missing_canary_evidence: %',v_readiness;
  end if;

  update public.whatsapp_channel_runtime_v1 r
  set metadata=jsonb_set(coalesce(r.metadata,'{}'::jsonb),
                         '{meta_document_live_enabled}',to_jsonb(true),true)
  where r.whatsapp_account_id=v_account_id;

  if not found then
    raise exception 'document_live_0975_runtime_missing';
  end if;
end;
$$;

-- Desliga explicitamente documentos live no segundo canal, sem alterar seus demais flags.
update public.whatsapp_channel_runtime_v1 r
set metadata=jsonb_set(coalesce(r.metadata,'{}'::jsonb),
                       '{meta_document_live_enabled}',to_jsonb(false),true)
from public.whatsapp_accounts a
where a.id=r.whatsapp_account_id
  and a.phone_e164='+5565984491018'
  and a.is_active=true;