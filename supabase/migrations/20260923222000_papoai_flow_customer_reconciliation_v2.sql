alter table public.customer_phones
  drop constraint if exists customer_phones_source_check;

alter table public.customer_phones
  add constraint customer_phones_source_check
  check (source = any (array[
    'whatsapp'::text,
    'bling'::text,
    'manual'::text,
    'import'::text,
    'papoai_flow'::text
  ]));

create or replace function public.reconcile_vitrine_order_customer_v1(
  p_customer_id uuid,
  p_order_suffix text default null,
  p_phone text default null,
  p_address jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_customer public.customers%rowtype;
  v_suffix text;
  v_order public.orders%rowtype;
  v_count integer:=0;
  v_source_order_id uuid;
  v_snapshot jsonb;
  v_delivery jsonb;
begin
  select * into v_customer from public.customers where id=p_customer_id;
  if not found then
    return jsonb_build_object('ok',false,'error','customer_not_found');
  end if;

  v_suffix:=regexp_replace(coalesce(p_order_suffix,''),'[^0-9]','','g');

  if v_suffix<>'' then
    select count(*) into v_count
    from public.orders
    where source='vitrine'
      and right(regexp_replace(coalesce(order_number,''),'[^0-9]','','g'),length(v_suffix))=v_suffix
      and (customer_id is null or customer_id=p_customer_id);

    if v_count=1 then
      select * into v_order
      from public.orders
      where source='vitrine'
        and right(regexp_replace(coalesce(order_number,''),'[^0-9]','','g'),length(v_suffix))=v_suffix
        and (customer_id is null or customer_id=p_customer_id)
      order by created_at desc
      limit 1;
    elsif v_count>1 then
      return jsonb_build_object('ok',false,'error','order_suffix_ambiguous','matches',v_count);
    end if;
  end if;

  if v_order.id is null and nullif(btrim(coalesce(p_phone,'')),'') is not null then
    select count(*) into v_count
    from public.orders o
    where o.source='vitrine'
      and (o.customer_id is null or o.customer_id=p_customer_id)
      and o.created_at>=now()-interval '24 hours'
      and public.normalize_phone_digits(o.phone_e164)=any(public.phone_variants_br(p_phone));

    if v_count=1 then
      select o.* into v_order
      from public.orders o
      where o.source='vitrine'
        and (o.customer_id is null or o.customer_id=p_customer_id)
        and o.created_at>=now()-interval '24 hours'
        and public.normalize_phone_digits(o.phone_e164)=any(public.phone_variants_br(p_phone))
      order by o.created_at desc
      limit 1;
    elsif v_count>1 then
      return jsonb_build_object('ok',false,'error','phone_order_ambiguous','matches',v_count);
    end if;
  end if;

  if v_order.id is null then
    return jsonb_build_object('ok',true,'linked',false,'reason','order_not_found');
  end if;

  v_snapshot:=coalesce(v_order.customer_snapshot,'{}'::jsonb)||jsonb_strip_nulls(jsonb_build_object(
    'source_customer_id',p_customer_id,
    'name',v_customer.name,
    'phone',coalesce(nullif(p_phone,''),v_customer.primary_whatsapp_e164),
    'cpf',v_customer.cpf_cnpj
  ));

  v_delivery:=coalesce(v_order.delivery_address,'{}'::jsonb)
    || coalesce(p_address,'{}'::jsonb)
    || jsonb_strip_nulls(jsonb_build_object(
      'source_customer_id',p_customer_id,
      'customer_status','registered',
      'customer_name',v_customer.name,
      'phone',coalesce(nullif(p_phone,''),v_customer.primary_whatsapp_e164),
      'cpf',v_customer.cpf_cnpj
    ));

  update public.orders
     set customer_id=p_customer_id,
         customer_snapshot=v_snapshot,
         delivery_address=v_delivery,
         updated_at=now()
   where id=v_order.id;

  begin
    v_source_order_id:=nullif(v_order.checkout_snapshot->>'source_order_id','')::uuid;
  exception when others then
    v_source_order_id:=null;
  end;

  perform public.refresh_customer_purchase_profile(p_customer_id);

  return jsonb_build_object(
    'ok',true,
    'linked',true,
    'order_id',v_order.id,
    'order_number',v_order.order_number,
    'source_order_id',v_source_order_id,
    'customer_id',p_customer_id
  );
end
$$;

revoke all on function public.reconcile_vitrine_order_customer_v1(uuid,text,text,jsonb)
  from public,anon,authenticated;
grant execute on function public.reconcile_vitrine_order_customer_v1(uuid,text,text,jsonb)
  to service_role;
