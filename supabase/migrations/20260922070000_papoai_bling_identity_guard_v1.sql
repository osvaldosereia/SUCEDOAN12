begin;

create or replace function public.get_papoai_commerce_bling_identity_readiness_v1(
  p_order_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $$
declare
  v_order public.orders%rowtype;
  v_customer public.customers%rowtype;
  v_doc text;
begin
  select * into v_order from public.orders where id=p_order_id;
  if not found then
    return jsonb_build_object('ready',false,'reason','order_not_found');
  end if;

  if v_order.customer_id is null then
    return jsonb_build_object('ready',false,'reason','order_without_customer');
  end if;

  select * into v_customer
  from public.customers
  where id=v_order.customer_id;

  if not found then
    return jsonb_build_object('ready',false,'reason','customer_not_found');
  end if;

  v_doc:=regexp_replace(coalesce(v_customer.cpf_cnpj,''),'[^0-9]','','g');

  return jsonb_build_object(
    'ready',
      v_customer.bling_contact_id is not null
      or length(v_doc) in (11,14),
    'customer_id',v_customer.id,
    'has_bling_contact_id',v_customer.bling_contact_id is not null,
    'has_valid_document_length',length(v_doc) in (11,14),
    'document_required',v_customer.bling_contact_id is null and length(v_doc) not in (11,14),
    'reason',case
      when v_customer.bling_contact_id is not null then 'bling_contact_already_bound'
      when length(v_doc) in (11,14) then 'document_available_for_resolution'
      else 'cpf_cnpj_required_for_bling_resolution'
    end
  );
end;
$$;

create or replace function public.queue_papoai_commerce_bling_v1(
  p_order_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_cfg public.papoai_commerce_brain_config%rowtype;
  v_order public.orders%rowtype;
  v_customer public.customers%rowtype;
  v_identity jsonb;
  v_doc text;
  v_snapshot jsonb;
  v_result jsonb;
begin
  select * into v_cfg from public.papoai_commerce_brain_config where id=1;

  if not coalesce(v_cfg.enabled,false) then
    return jsonb_build_object('ok',false,'reason','commerce_brain_disabled','queued',false);
  end if;
  if not coalesce(v_cfg.bling_queue_enabled,false) then
    return jsonb_build_object('ok',false,'reason','papoai_bling_queue_disabled','queued',false);
  end if;

  select * into v_order from public.orders where id=p_order_id for update;
  if not found then
    return jsonb_build_object('ok',false,'reason','order_not_found','queued',false);
  end if;

  if v_order.source<>'papoai_external_agent' then
    return jsonb_build_object('ok',false,'reason','order_not_from_papoai','queued',false);
  end if;
  if v_order.status<>'confirmed' then
    return jsonb_build_object(
      'ok',false,'reason','order_not_confirmed','queued',false,'status',v_order.status
    );
  end if;
  if v_order.bling_order_id is not null then
    return jsonb_build_object(
      'ok',true,'reason','already_synced','queued',false,
      'bling_order_id',v_order.bling_order_id
    );
  end if;

  v_identity:=public.get_papoai_commerce_bling_identity_readiness_v1(v_order.id);
  if not coalesce((v_identity->>'ready')::boolean,false) then
    return jsonb_build_object(
      'ok',false,
      'queued',false,
      'reason',v_identity->>'reason',
      'identity',v_identity
    );
  end if;

  select * into v_customer
  from public.customers
  where id=v_order.customer_id
  for update;

  v_doc:=regexp_replace(coalesce(v_customer.cpf_cnpj,''),'[^0-9]','','g');

  v_snapshot:=coalesce(v_order.customer_snapshot,'{}'::jsonb)
    || jsonb_build_object(
      'id',v_customer.id,
      'name',v_customer.name,
      'phone',coalesce(v_customer.primary_whatsapp_e164,v_order.phone_e164),
      'cpf_cnpj',case when length(v_doc) in (11,14) then v_doc else null end,
      'bling_contact_id',v_customer.bling_contact_id
    );

  update public.orders
     set customer_snapshot=v_snapshot,
         updated_at=now()
   where id=v_order.id;

  v_result:=public.queue_bling_order_backoffice_v1(
    v_order.id,
    'DA-PAPOAI-'||replace(v_order.id::text,'-','')
  );

  return jsonb_build_object(
    'ok',true,
    'queued',true,
    'order_id',v_order.id,
    'identity',v_identity,
    'queue',v_result,
    'external_side_effect',false
  );
end;
$$;

revoke all on function public.get_papoai_commerce_bling_identity_readiness_v1(uuid) from public,anon,authenticated;
grant execute on function public.get_papoai_commerce_bling_identity_readiness_v1(uuid) to service_role;

revoke all on function public.queue_papoai_commerce_bling_v1(uuid) from public,anon,authenticated;
grant execute on function public.queue_papoai_commerce_bling_v1(uuid) to service_role;

update public.papoai_commerce_brain_config
set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
  'bling_identity_policy','use_bling_contact_id_else_require_cpf_cnpj',
  'bling_order_snapshot_refresh_before_queue',true
),
updated_at=now()
where id=1;

commit;
