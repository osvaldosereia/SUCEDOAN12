create table if not exists public.internal_integration_secrets (
  integration_key text primary key,
  secret_value text not null,
  updated_at timestamptz not null default now()
);
alter table public.internal_integration_secrets enable row level security;
revoke all on table public.internal_integration_secrets from public, anon, authenticated;
grant select,insert,update,delete on table public.internal_integration_secrets to service_role;
drop policy if exists service_role_internal_integration_secrets on public.internal_integration_secrets;
create policy service_role_internal_integration_secrets
  on public.internal_integration_secrets for all to service_role
  using (true) with check (true);

create or replace function public.ingest_vitrine_order_history_v1(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_source_order_id uuid;
  v_idempotency text;
  v_existing public.orders%rowtype;
  v_order_id uuid;
  v_customer_id uuid;
  v_previous_customer_id uuid;
  v_source_customer_id uuid;
  v_cpf text;
  v_phone text;
  v_status text;
  v_payment text;
  v_order_number text;
  v_item jsonb;
  v_component jsonb;
  v_product_id uuid;
  v_gtin text;
  v_sku text;
  v_parent_qty numeric;
  v_item_count integer := 0;
  v_component_count integer := 0;
  v_matches integer := 0;
begin
  begin
    v_source_order_id := nullif(p_payload->>'source_order_id','')::uuid;
  exception when others then
    return jsonb_build_object('ok',false,'error','invalid_source_order_id');
  end;
  if v_source_order_id is null then
    return jsonb_build_object('ok',false,'error','source_order_id_required');
  end if;

  v_idempotency := 'vitrine:'||v_source_order_id::text;
  v_cpf := regexp_replace(coalesce(p_payload#>>'{customer,cpf}',''),'[^0-9]','','g');
  v_phone := regexp_replace(coalesce(p_payload#>>'{customer,phone}',''),'[^0-9]','','g');

  begin
    v_source_customer_id := nullif(p_payload#>>'{customer,source_customer_id}','')::uuid;
  exception when others then
    v_source_customer_id := null;
  end;

  if v_source_customer_id is not null
     and exists(select 1 from public.customers where id=v_source_customer_id) then
    v_customer_id := v_source_customer_id;
  elsif length(v_cpf) in (11,14) then
    select c.id into v_customer_id
    from public.customers c
    where regexp_replace(coalesce(c.cpf_cnpj,''),'[^0-9]','','g')=v_cpf
    limit 1;
  end if;

  if v_customer_id is null and length(v_phone)>=10 then
    with candidates as (
      select c.id
      from public.customers c
      where regexp_replace(coalesce(c.primary_whatsapp_e164,''),'[^0-9]','','g')=v_phone
      union
      select cp.customer_id
      from public.customer_phones cp
      where regexp_replace(coalesce(cp.phone_e164,''),'[^0-9]','','g')=v_phone
    )
    select count(*), (array_agg(id))[1] into v_matches,v_customer_id
    from (select distinct id from candidates) x;
    if v_matches<>1 then v_customer_id:=null; end if;
  end if;

  v_status := case lower(coalesce(p_payload->>'status',''))
    when 'created' then 'storefront_received'
    when 'confirmed' then 'confirmed'
    when 'processing' then 'processing'
    when 'ready' then 'ready'
    when 'out_for_delivery' then 'out_for_delivery'
    when 'delivered' then 'delivered'
    when 'cancelled' then 'cancelled'
    when 'returned' then 'returned'
    else 'storefront_received'
  end;

  v_payment := lower(coalesce(p_payload#>>'{payment,method}',p_payload#>>'{payment,label}',''));
  v_payment := case
    when v_payment like '%pix%' then 'pix'
    when v_payment like '%dinheir%' or v_payment like '%cash%' then 'cash'
    when v_payment like '%débito%' or v_payment like '%debito%' or v_payment like '%debit%' then 'debit_card'
    when v_payment like '%crédito%' or v_payment like '%credito%' or v_payment like '%credit%' then 'credit_card'
    when v_payment like '%aliment%' then 'food_card'
    when v_payment like '%refei%' or v_payment like '%meal%' then 'meal_card'
    else null
  end;

  v_order_number := 'V-'||coalesce(nullif(p_payload->>'order_number',''), right(replace(v_source_order_id::text,'-',''),10));

  select * into v_existing
  from public.orders
  where idempotency_key=v_idempotency
  limit 1;

  v_previous_customer_id := v_existing.customer_id;

  if v_existing.id is null then
    insert into public.orders(
      customer_id,status,total,currency,delivery_address,customer_snapshot,
      confirmed_at,created_at,updated_at,payment_method,phone_e164,source,
      subtotal,discount,other_expenses,sync_status,idempotency_key,order_number,
      checkout_snapshot,delivered_at,cancelled_at,returned_at
    ) values (
      v_customer_id,
      v_status,
      coalesce((p_payload->>'total_cents')::numeric,0)/100,
      'BRL',
      coalesce(p_payload->'delivery','{}'::jsonb),
      coalesce(p_payload->'customer','{}'::jsonb),
      nullif(p_payload->>'confirmed_at','')::timestamptz,
      coalesce(nullif(p_payload->>'created_at','')::timestamptz,now()),
      now(),
      v_payment,
      nullif(p_payload#>>'{customer,phone}',''),
      'vitrine',
      coalesce((p_payload->>'subtotal_cents')::numeric,0)/100,
      coalesce((p_payload->>'discount_cents')::numeric,0)/100,
      coalesce((p_payload->>'delivery_cents')::numeric,0)/100,
      'local',
      v_idempotency,
      v_order_number,
      jsonb_build_object(
        'source','vitrine',
        'source_order_id',v_source_order_id,
        'source_order_number',p_payload->>'order_number',
        'payment',coalesce(p_payload->'payment','{}'::jsonb),
        'history_sync_version',1
      ),
      nullif(p_payload->>'delivered_at','')::timestamptz,
      case when v_status='cancelled' then coalesce(nullif(p_payload->>'updated_at','')::timestamptz,now()) else null end,
      case when v_status='returned' then coalesce(nullif(p_payload->>'updated_at','')::timestamptz,now()) else null end
    )
    returning id into v_order_id;
  else
    v_order_id := v_existing.id;
    update public.orders
    set customer_id=v_customer_id,
        status=v_status,
        total=coalesce((p_payload->>'total_cents')::numeric,0)/100,
        delivery_address=coalesce(p_payload->'delivery','{}'::jsonb),
        customer_snapshot=coalesce(p_payload->'customer','{}'::jsonb),
        confirmed_at=nullif(p_payload->>'confirmed_at','')::timestamptz,
        updated_at=now(),
        payment_method=v_payment,
        phone_e164=nullif(p_payload#>>'{customer,phone}',''),
        subtotal=coalesce((p_payload->>'subtotal_cents')::numeric,0)/100,
        discount=coalesce((p_payload->>'discount_cents')::numeric,0)/100,
        other_expenses=coalesce((p_payload->>'delivery_cents')::numeric,0)/100,
        order_number=v_order_number,
        checkout_snapshot=coalesce(v_existing.checkout_snapshot,'{}'::jsonb)||jsonb_build_object(
          'source','vitrine',
          'source_order_id',v_source_order_id,
          'source_order_number',p_payload->>'order_number',
          'payment',coalesce(p_payload->'payment','{}'::jsonb),
          'history_sync_version',1
        ),
        delivered_at=nullif(p_payload->>'delivered_at','')::timestamptz,
        cancelled_at=case when v_status='cancelled' then coalesce(v_existing.cancelled_at,now()) else null end,
        returned_at=case when v_status='returned' then coalesce(v_existing.returned_at,now()) else null end
    where id=v_order_id;
    delete from public.order_items where order_id=v_order_id;
  end if;

  for v_item in select value from jsonb_array_elements(coalesce(p_payload->'items','[]'::jsonb))
  loop
    v_product_id:=null;
    v_gtin:=nullif(regexp_replace(coalesce(v_item->>'gtin',''),'[^0-9A-Za-z]','','g'),'');
    v_sku:=nullif(trim(coalesce(v_item->>'sku','')),'');
    if v_gtin is not null then select id into v_product_id from public.products where gtin=v_gtin limit 1; end if;
    if v_product_id is null and v_sku is not null then select id into v_product_id from public.products where sku=v_sku limit 1; end if;

    insert into public.order_items(order_id,product_id,sku_snapshot,name_snapshot,quantity,unit_price,line_total,metadata)
    values(
      v_order_id,
      case when coalesce(v_item->>'kind','product')='product' then v_product_id else null end,
      v_sku,coalesce(nullif(v_item->>'name',''),'Item'),
      greatest(coalesce((v_item->>'quantity')::numeric,0),0),
      coalesce((v_item->>'unit_price_cents')::numeric,0)/100,
      coalesce((v_item->>'total_cents')::numeric,0)/100,
      coalesce(v_item->'metadata','{}'::jsonb)||jsonb_build_object('history_kind',coalesce(v_item->>'kind','product'),'source','vitrine')
    );
    v_item_count:=v_item_count+1;

    if coalesce(v_item->>'kind','')='basket' then
      v_parent_qty:=greatest(coalesce((v_item->>'quantity')::numeric,1),0);
      for v_component in select value from jsonb_array_elements(coalesce(v_item->'components','[]'::jsonb))
      loop
        v_product_id:=null;
        v_gtin:=nullif(regexp_replace(coalesce(v_component->>'gtin',''),'[^0-9A-Za-z]','','g'),'');
        v_sku:=nullif(trim(coalesce(v_component->>'sku','')),'');
        if v_gtin is not null then select id into v_product_id from public.products where gtin=v_gtin limit 1; end if;
        if v_product_id is null and v_sku is not null then select id into v_product_id from public.products where sku=v_sku limit 1; end if;

        insert into public.order_items(order_id,product_id,sku_snapshot,name_snapshot,quantity,unit_price,line_total,metadata)
        values(
          v_order_id,v_product_id,v_sku,coalesce(nullif(v_component->>'name',''),'Item da cesta'),
          greatest(coalesce((v_component->>'quantity')::numeric,0)*v_parent_qty,0),
          0,0,
          coalesce(v_component->'metadata','{}'::jsonb)||jsonb_build_object(
            'history_kind','basket_component','source','vitrine',
            'parent_basket_name',coalesce(v_item->>'name','Cesta'),
            'parent_basket_quantity',v_parent_qty
          )
        );
        v_component_count:=v_component_count+1;
      end loop;
    end if;
  end loop;

  if v_previous_customer_id is not null and v_previous_customer_id is distinct from v_customer_id then
    perform public.refresh_customer_purchase_profile(v_previous_customer_id);
  end if;
  if v_customer_id is not null then perform public.refresh_customer_purchase_profile(v_customer_id); end if;

  return jsonb_build_object(
    'ok',true,'order_id',v_order_id,'customer_id',v_customer_id,'linked',v_customer_id is not null,
    'item_count',v_item_count,'component_count',v_component_count,'idempotency_key',v_idempotency
  );
end
$$;

revoke all on function public.ingest_vitrine_order_history_v1(jsonb) from public,anon,authenticated;
grant execute on function public.ingest_vitrine_order_history_v1(jsonb) to service_role;

create or replace function public.get_customer_top_products_v1(p_customer_id uuid,p_limit integer default 12)
returns table(
  product_id uuid,name text,sku text,gtin text,purchase_count integer,total_quantity numeric,total_spent numeric,
  first_purchase_at timestamptz,last_purchase_at timestamptz
)
language sql
stable
security definer
set search_path=''
as $$
  select s.product_id,p.name,p.sku,p.gtin,s.purchase_count,s.total_quantity,s.total_spent,s.first_purchase_at,s.last_purchase_at
  from public.customer_product_stats s
  join public.products p on p.id=s.product_id
  where s.customer_id=p_customer_id
  order by s.total_quantity desc,s.purchase_count desc,s.last_purchase_at desc
  limit greatest(1,least(coalesce(p_limit,12),50))
$$;
revoke all on function public.get_customer_top_products_v1(uuid,integer) from public,anon,authenticated;
grant execute on function public.get_customer_top_products_v1(uuid,integer) to service_role;

-- The actual bridge secret is provisioned operationally and is intentionally not stored in source control.
