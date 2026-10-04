-- Dona Antônia — retorno identificado pós-cadastro sem dependência PapoAI
-- 2026-10-04
-- Mantém o capability de registration_job, rate limit e ACL existentes;
-- troca apenas a emissão do catálogo para o RPC provider-neutral do Storefront.

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
  v_gate boolean;
begin
  if p_customer_id is null or p_registration_job_id is null then
    return jsonb_build_object('ok',false,'error','registration_receipt_required');
  end if;

  v_gate:=public.consume_public_rate_limit(
    'registration-catalog-return:job:'||p_registration_job_id::text,
    'registration_catalog_return',
    6,
    600
  );
  if v_gate is distinct from true then
    return jsonb_build_object('ok',false,'error','rate_limited');
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
    v_link:=public.ops2_issue_storefront_catalog_link_v1(
      v_phone,
      v_conversation_id,
      'registration-return:'||p_registration_job_id::text,
      'registration',
      120
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
