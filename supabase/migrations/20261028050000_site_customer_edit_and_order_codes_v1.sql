-- One canonical order code: two letters followed by three digits.
-- Existing order_number/public_code values are preserved for historical orders.
create or replace function public.site_order_number_short_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_code_value bigint;
begin
  v_code_value := nextval('public.order_public_code_seq_v1'::regclass);
  if v_code_value > 675999 then
    raise exception using message = 'order_public_code_exhausted';
  end if;
  new.order_number := public.ops2_format_order_public_code_v1(v_code_value);
  return new;
end;
$function$;

revoke all on function public.site_order_number_short_v1() from public, anon, authenticated;
grant execute on function public.site_order_number_short_v1() to service_role;

drop trigger if exists trg_site_order_number_short_v1 on public.orders;
create trigger trg_site_order_number_short_v1
before insert on public.orders
for each row execute function public.site_order_number_short_v1();

-- A new order reuses order_number as its public code. Older orders keep their
-- existing public codes, and later snapshot refreshes no longer consume a new
-- public code for the new short-code orders.
CREATE OR REPLACE FUNCTION public.ops2_refresh_order_public_snapshot_v1(p_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_order public.orders%rowtype;
  v_completion public.order_separation_completions_v1%rowtype;
  v_snapshot jsonb;
  v_live_missing_subtotal numeric(14,2) := 0;
  v_original_total numeric(14,2) := 0;
  v_final_total numeric(14,2) := 0;
begin
  select * into v_order from public.orders where id=p_order_id;
  if not found then return null; end if;

  select * into v_completion
  from public.order_separation_completions_v1
  where order_id=p_order_id;

  select round(coalesce(sum(s.line_total),0)::numeric,2)
  into v_live_missing_subtotal
  from public.order_separation_items_v1 s
  join public.order_items oi on oi.id=s.order_item_id
  where s.order_id=p_order_id
    and s.state='missing'
    and not (
      coalesce(oi.metadata->>'history_kind','') in ('basket','basket_mold')
      and exists(
        select 1 from public.order_items c
        where c.order_id=p_order_id
          and coalesce(c.metadata->>'history_kind','') in ('basket_component','basket_mold_component')
          and (
            (
              nullif(oi.metadata->>'basket_id','') is not null
              and nullif(c.metadata->>'basket_id','')=nullif(oi.metadata->>'basket_id','')
            )
            or lower(trim(coalesce(nullif(c.metadata->>'basket_name',''),nullif(c.metadata->>'parent_basket_name',''),'')))
               = lower(trim(coalesce(nullif(oi.metadata->>'basket_name',''),oi.name_snapshot,'')))
          )
      )
    );

  if v_completion.id is not null then
    v_original_total := round(coalesce(v_completion.original_total,v_order.total,0)::numeric,2);
    v_live_missing_subtotal := round(coalesce(v_completion.missing_subtotal,v_live_missing_subtotal,0)::numeric,2);
    v_final_total := round(coalesce(v_completion.final_total,v_order.total,0)::numeric,2);
  else
    v_original_total := round(coalesce(v_order.total,0)::numeric,2);
    v_final_total := greatest(0,round(v_original_total-v_live_missing_subtotal,2));
  end if;

  select jsonb_strip_nulls(jsonb_build_object(
    'version',3,
    'order_id',v_order.id::text,
    'order_number',v_order.order_number,
    'created_at',v_order.created_at,
    'total',v_final_total,
    'subtotal',case when v_completion.id is not null then v_order.subtotal else greatest(0,round(coalesce(v_order.subtotal,0)-v_live_missing_subtotal,2)) end,
    'original_total',v_original_total,
    'missing_subtotal',v_live_missing_subtotal,
    'final_total',v_final_total,
    'separation_completed_at',v_completion.completed_at,
    'payment_label',coalesce(nullif(v_order.checkout_snapshot->>'payment_label',''),nullif(v_order.payment_method,''),'A confirmar'),
    'customer_name',coalesce(nullif(v_order.customer_snapshot->>'name',''),nullif(v_order.customer_snapshot->>'display_name',''),nullif(v_order.delivery_address->>'customer_name',''),'Cliente'),
    'delivery',jsonb_strip_nulls(jsonb_build_object(
      'street',v_order.delivery_address->>'street',
      'number',v_order.delivery_address->>'number',
      'complement',v_order.delivery_address->>'complement',
      'district',coalesce(nullif(v_order.delivery_address->>'district',''),nullif(v_order.delivery_address->>'neighborhood','')),
      'city',v_order.delivery_address->>'city',
      'state',v_order.delivery_address->>'state',
      'reference',coalesce(nullif(v_order.delivery_address->>'reference',''),nullif(v_order.delivery_address->>'raw_text','')),
      'delivery_date',v_order.delivery_address->>'delivery_date',
      'delivery_label',v_order.delivery_address->>'delivery_label'
    )),
    'baskets',coalesce((
      select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'id',coalesce(bt.id::text,x.item->>'id'),
        'name',coalesce(bt.name,v_order.basket_name_snapshot,'Cesta'),
        'image_url',nullif(bt.image_url,''),
        'quantity',coalesce(nullif(x.item->>'qty','')::numeric,1)
      )) order by x.ord)
      from jsonb_array_elements(coalesce(v_order.checkout_snapshot->'cart','[]'::jsonb)) with ordinality as x(item,ord)
      left join public.basket_templates bt on bt.id::text=x.item->>'id'
      where x.item->>'type' in ('basket','basket_mold')
    ),'[]'::jsonb),
    'items',coalesce((
      select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'order_item_id',oi.id::text,
        'name',oi.name_snapshot,
        'quantity',oi.quantity,
        'unit_price',oi.unit_price,
        'line_total',oi.line_total,
        'image_url',nullif(coalesce(oi.metadata->>'image_url',p.image_url,''),''),
        'basket_name',nullif(oi.metadata->>'basket_name',''),
        'basket_id',nullif(oi.metadata->>'basket_id',''),
        'kind',coalesce(nullif(oi.metadata->>'history_kind',''),'product'),
        'separation_state',si.state
      )) order by oi.created_at,oi.id)
      from public.order_items oi
      left join public.products p on p.id=oi.product_id
      left join public.order_separation_items_v1 si
        on si.order_id=oi.order_id and si.order_item_id=oi.id
      where oi.order_id=p_order_id
        and oi.quantity>0
        and not (
          coalesce(oi.metadata->>'history_kind','') in ('basket','basket_mold')
          and exists(
            select 1
            from public.order_items c
            where c.order_id=p_order_id
              and coalesce(c.metadata->>'history_kind','') in ('basket_component','basket_mold_component')
              and (
                (
                  nullif(oi.metadata->>'basket_id','') is not null
                  and nullif(c.metadata->>'basket_id','')=nullif(oi.metadata->>'basket_id','')
                )
                or lower(trim(coalesce(nullif(c.metadata->>'basket_name',''),nullif(c.metadata->>'parent_basket_name',''),'')))
                   = lower(trim(coalesce(nullif(oi.metadata->>'basket_name',''),oi.name_snapshot,'')))
              )
          )
        )
    ),'[]'::jsonb)
  )) into v_snapshot;

  insert into public.order_public_snapshots_v1 as existing_snapshot
    (order_id,public_code,snapshot,refreshed_at)
  values(
    p_order_id,
    case
      when v_order.order_number ~ '^[A-Z]{2}[0-9]{3}$'
      then v_order.order_number
      else public.ops2_format_order_public_code_v1(nextval('public.order_public_code_seq_v1'::regclass))
    end,
    v_snapshot,
    now()
  )
  on conflict(order_id) do update
    set public_code = case
          when v_order.order_number ~ '^[A-Z]{2}[0-9]{3}$'
      then excluded.public_code
          else existing_snapshot.public_code
        end,
        snapshot=excluded.snapshot,
        refreshed_at=now();

  return v_snapshot;
end;
$function$;


-- Used only by the code-protected site-admin-v1 Edge Function.
create or replace function public.ops2_site_admin_customer_update_v1(
  p_customer_id uuid,
  p_expected_customer_updated_at timestamptz,
  p_name text,
  p_address_id uuid,
  p_expected_address_updated_at timestamptz,
  p_address jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $function$
declare
  v_customer_updated_at timestamptz;
  v_address_updated_at timestamptz;
  v_address_id uuid := p_address_id;
  v_now timestamptz := clock_timestamp();
  v_name text := btrim(coalesce(p_name, ''));
  v_street text := btrim(coalesce(p_address->>'street', ''));
  v_number text := btrim(coalesce(p_address->>'number', ''));
  v_complement text := nullif(btrim(coalesce(p_address->>'complement', '')), '');
  v_neighborhood text := btrim(coalesce(p_address->>'neighborhood', ''));
  v_city text := btrim(coalesce(p_address->>'city', ''));
  v_state text := upper(btrim(coalesce(p_address->>'state', '')));
  v_postal_code text := nullif(btrim(coalesce(p_address->>'postal_code', '')), '');
  v_reference text := nullif(btrim(coalesce(p_address->>'reference', '')), '');
  v_has_address boolean;
begin
  if p_customer_id is null or p_expected_customer_updated_at is null then
    return jsonb_build_object('ok', false, 'error', 'invalid_customer_snapshot');
  end if;
  if length(v_name) < 2 or length(v_name) > 180 then
    return jsonb_build_object('ok', false, 'error', 'customer_name_required');
  end if;

  v_has_address := concat_ws('', v_street, v_number, v_complement, v_neighborhood, v_city, v_state, v_postal_code, v_reference) <> '';
  if v_has_address and (
    v_street = '' or v_number = '' or v_neighborhood = '' or v_city = '' or length(v_state) <> 2
  ) then
    return jsonb_build_object('ok', false, 'error', 'invalid_customer_address');
  end if;
  if p_address_id is not null and (not v_has_address or p_expected_address_updated_at is null) then
    return jsonb_build_object('ok', false, 'error', 'invalid_address_snapshot');
  end if;

  select c.updated_at
    into v_customer_updated_at
  from public.customers as c
  where c.id = p_customer_id and c.is_active = true
  for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'customer_not_found');
  end if;
  if v_customer_updated_at is distinct from p_expected_customer_updated_at then
    return jsonb_build_object('ok', false, 'error', 'customer_changed');
  end if;

  if p_address_id is not null then
    select a.updated_at
      into v_address_updated_at
    from public.customer_addresses as a
    where a.id = p_address_id and a.customer_id = p_customer_id and a.is_active = true
    for update;
    if not found then
      return jsonb_build_object('ok', false, 'error', 'customer_address_not_found');
    end if;
    if v_address_updated_at is distinct from p_expected_address_updated_at then
      return jsonb_build_object('ok', false, 'error', 'customer_changed');
    end if;
  end if;

  update public.customers
  set name = v_name, updated_at = v_now
  where id = p_customer_id
  returning updated_at into v_customer_updated_at;

  if p_address_id is not null then
    update public.customer_addresses
    set street = v_street,
        number = v_number,
        complement = v_complement,
        neighborhood = v_neighborhood,
        city = v_city,
        state = v_state,
        postal_code = v_postal_code,
        reference = v_reference,
        updated_at = v_now
    where id = p_address_id and customer_id = p_customer_id
    returning id, updated_at into v_address_id, v_address_updated_at;
  elsif v_has_address then
    insert into public.customer_addresses (
      customer_id, street, number, complement, neighborhood, city, state,
      postal_code, reference, is_default, is_active, updated_at
    )
    values (
      p_customer_id, v_street, v_number, v_complement, v_neighborhood, v_city, v_state,
      v_postal_code, v_reference, false, true, v_now
    )
    returning id, updated_at into v_address_id, v_address_updated_at;
  end if;

  insert into public.admin_audit_logs (
    admin_user_id, action, entity_type, entity_id, details
  )
  values (
    null,
    'customer_update_admin_code',
    'customer',
    p_customer_id::text,
    jsonb_build_object(
      'source', 'site_admin_code',
      'fields', case when v_address_id is null then jsonb_build_array('name')
                     else jsonb_build_array('name', 'address') end,
      'address_id', v_address_id
    )
  );

  return jsonb_build_object(
    'ok', true,
    'customer_updated_at', v_customer_updated_at,
    'address_id', v_address_id,
    'address_updated_at', v_address_updated_at
  );
end;
$function$;

revoke all on function public.ops2_site_admin_customer_update_v1(uuid,timestamptz,text,uuid,timestamptz,jsonb)
  from public, anon, authenticated;
grant execute on function public.ops2_site_admin_customer_update_v1(uuid,timestamptz,text,uuid,timestamptz,jsonb)
  to service_role;
