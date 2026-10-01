-- Dona Antônia — retorno identificado ao catálogo após cadastro avulso
-- 2026-10-01
-- O cadastro continua sem criar pedido. Esta função apenas emite um link curto
-- de identidade depois de validar uma prova de cadastro recém-concluído.

create or replace function public.ops2_issue_registration_catalog_return_v1(
  p_customer_id uuid,
  p_registration_job_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_customer public.customers%rowtype;
  v_state jsonb;
  v_phone text;
  v_job public.bling_hub_jobs_v2%rowtype;
  v_conversation_id uuid;
  v_whatsapp_account_id uuid;
  v_channel_phone_e164 text;
  v_link jsonb;
begin
  if p_customer_id is null or p_registration_job_id is null then
    return jsonb_build_object('ok',false,'error','registration_receipt_required');
  end if;

  select j.* into v_job
  from public.bling_hub_jobs_v2 j
  where j.id=p_registration_job_id
    and j.domain='customer'
    and j.operation='sync_customer'
    and j.source_system='canonical_ssbes'
    and j.source_id=p_customer_id::text;

  if not found then
    return jsonb_build_object('ok',false,'error','invalid_registration_receipt');
  end if;

  select c.* into v_customer
  from public.customers c
  where c.id=p_customer_id;

  if not found then
    return jsonb_build_object('ok',false,'error','customer_not_found');
  end if;

  -- O capability retornado pelo cadastro só é aceito enquanto o cadastro está recente.
  -- Isso reduz o risco de reutilização de um job antigo como chave permanente.
  if v_customer.updated_at < now()-interval '15 minutes' then
    return jsonb_build_object('ok',false,'error','registration_receipt_expired');
  end if;

  v_state:=public.ops2_customer_registration_state_v1(p_customer_id);
  if coalesce((v_state->>'registration_complete')::boolean,false) is not true then
    return jsonb_build_object('ok',false,'error','registration_incomplete');
  end if;

  v_phone:=public.canonical_whatsapp_e164_br_v2(v_customer.primary_whatsapp_e164);
  if v_phone is null then
    return jsonb_build_object('ok',false,'error','customer_phone_missing');
  end if;

  -- Preferir conversa já ligada ao cliente. Se ainda não estiver ligada, usar a
  -- conversa WhatsApp mais recente com o mesmo telefone. Isso cobre o cadastro
  -- avulso iniciado pela conversa no PapoAI sem depender do Flow antigo.
  select c.id,c.whatsapp_account_id,wa.phone_e164
    into v_conversation_id,v_whatsapp_account_id,v_channel_phone_e164
  from public.conversations c
  left join public.whatsapp_accounts wa
    on wa.id=c.whatsapp_account_id and wa.is_active=true
  where c.whatsapp_account_id is not null
    and c.updated_at >= now()-interval '31 days'
    and (
      c.customer_id=p_customer_id
      or public.canonical_whatsapp_e164_br_v2(c.wa_contact_e164)=v_phone
    )
  order by
    (c.customer_id=p_customer_id) desc,
    greatest(
      coalesce(c.last_inbound_at,'epoch'::timestamptz),
      coalesce(c.last_outbound_at,'epoch'::timestamptz),
      coalesce(c.updated_at,'epoch'::timestamptz),
      coalesce(c.created_at,'epoch'::timestamptz)
    ) desc
  limit 1;

  begin
    v_link:=public.ops2_issue_papoai_catalog_link_v1(
      v_phone,
      v_conversation_id,
      'registration-return:'||p_registration_job_id::text
    );
  exception when others then
    return jsonb_build_object('ok',false,'error','catalog_link_unavailable');
  end;

  if coalesce((v_link->>'ok')::boolean,false) is not true then
    return jsonb_build_object('ok',false,'error',coalesce(v_link->>'error','catalog_link_failed'));
  end if;

  return jsonb_build_object(
    'ok',true,
    'customer_id',p_customer_id,
    'conversation_id',v_conversation_id,
    'conversation_found',v_conversation_id is not null,
    'whatsapp_account_id',v_whatsapp_account_id,
    'channel_phone_e164',v_channel_phone_e164,
    'catalog_path',v_link->>'catalog_path',
    'catalog_url','https://www.donaantonia.com.br'||coalesce(v_link->>'catalog_path',''),
    'catalog_expires_at',v_link->>'expires_at',
    'catalog_reused',coalesce((v_link->>'reused')::boolean,false)
  );
end;
$$;

revoke all on function public.ops2_issue_registration_catalog_return_v1(uuid,uuid) from public,anon,authenticated;
grant execute on function public.ops2_issue_registration_catalog_return_v1(uuid,uuid) to service_role;
