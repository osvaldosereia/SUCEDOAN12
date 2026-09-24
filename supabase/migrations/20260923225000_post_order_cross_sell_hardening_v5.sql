-- Final hardening for post-order cross-sell.
-- Includes response-window expiration, delivery-date validity and duplicate-at-accept guards.

CREATE OR REPLACE FUNCTION public.accept_post_order_cross_sell_v1(p_session_id uuid, p_positions integer[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_session public.post_order_cross_sell_sessions%rowtype;
  v_cfg public.post_order_cross_sell_config%rowtype;
  v_order public.orders%rowtype;
  v_positions integer[];
  v_items_count integer := 0;
  v_added integer := 0;
  v_new_total integer := 0;
  v_reserve jsonb;
  v_stock_consumed boolean := false;
  v_min_expiration_date date := (timezone('America/Cuiaba',now()))::date;
begin
  select * into v_session
  from public.post_order_cross_sell_sessions
  where id=p_session_id
  for update;
  if not found then return jsonb_build_object('ok',false,'error','session_not_found'); end if;

  select * into v_cfg
  from public.post_order_cross_sell_config
  where organization_id=v_session.organization_id;
  if not found or not v_cfg.enabled or v_cfg.mode not in ('test','canary','live') then
    return jsonb_build_object('ok',false,'error','cross_sell_write_disabled');
  end if;

  if v_session.status not in ('sent','sent_test') then
    return jsonb_build_object('ok',false,'error','session_not_open');
  end if;
  if v_session.expires_at is null or v_session.expires_at<=now() then
    update public.post_order_cross_sell_sessions
       set status='expired',completed_at=now(),updated_at=now()
     where id=v_session.id;
    return jsonb_build_object('ok',false,'error','session_expired');
  end if;

  select * into v_order
  from public.orders
  where id=v_session.order_id and organization_id=v_session.organization_id
  for update;
  if not found then return jsonb_build_object('ok',false,'error','order_not_found'); end if;

  begin
    v_min_expiration_date := greatest(
      (timezone('America/Cuiaba',now()))::date,
      nullif(v_order.delivery_address_snapshot->>'delivery_date','')::date
    );
    if v_min_expiration_date is null then
      v_min_expiration_date := (timezone('America/Cuiaba',now()))::date;
    end if;
  exception when others then
    v_min_expiration_date := (timezone('America/Cuiaba',now()))::date;
  end;

  select exists(
    select 1 from public.order_stock_reservations
    where organization_id=v_session.organization_id
      and order_id=v_session.order_id
      and status='consumed'
  ) into v_stock_consumed;
  if v_stock_consumed then
    return jsonb_build_object('ok',false,'error','separation_already_started');
  end if;
  if v_order.status in ('cancelled','returned','delivered') then
    return jsonb_build_object('ok',false,'error','order_not_editable');
  end if;

  if v_cfg.mode='test' and coalesce(v_cfg.test_phone_suffix,'')<>'' then
    if right(regexp_replace(coalesce(v_order.whatsapp_phone_e164,''),'[^0-9]','','g'),length(v_cfg.test_phone_suffix))<>v_cfg.test_phone_suffix then
      return jsonb_build_object('ok',false,'error','test_phone_not_allowed');
    end if;
  end if;

  select coalesce(array_agg(distinct p order by p),'{}'::integer[])
    into v_positions
  from unnest(coalesce(p_positions,'{}'::integer[])) p
  where p between 1 and 10;

  if coalesce(array_length(v_positions,1),0)=0 then
    return jsonb_build_object('ok',false,'error','positions_required');
  end if;

  select count(*) into v_items_count
  from public.post_order_cross_sell_items i
  join public.products p on p.id=i.product_id
  where i.session_id=v_session.id
    and i.position=any(v_positions)
    and p.organization_id=v_session.organization_id
    and p.active=true
    and coalesce(p.stock_quantity,0)>0
    and i.offered_price_cents>0
    and not exists(
      select 1
      from public.order_items oi
      where oi.order_id=v_session.order_id
        and oi.product_id=i.product_id
    )
    and not exists(
      select 1
      from public.order_items oi
      join public.order_item_components oic on oic.order_item_id=oi.id
      where oi.order_id=v_session.order_id
        and oic.product_id=i.product_id
    )
    and (
      i.expiration_date_snapshot is null
      or (
        p.expiration_date is not distinct from i.expiration_date_snapshot
        and p.expiration_date >= v_min_expiration_date
      )
    );

  if v_items_count<>array_length(v_positions,1) then
    return jsonb_build_object('ok',false,'error','one_or_more_items_unavailable');
  end if;

  select public.reserve_storefront_order_stock_v2(
    v_session.organization_id,
    v_session.order_id,
    coalesce(jsonb_agg(jsonb_build_object('product_id',i.product_id,'quantity',1)),'[]'::jsonb)
  )
  into v_reserve
  from public.post_order_cross_sell_items i
  where i.session_id=v_session.id and i.position=any(v_positions);

  if coalesce((v_reserve->>'ok')::boolean,false) is not true then
    return jsonb_build_object(
      'ok',false,
      'error',coalesce(v_reserve->>'error','stock_reservation_failed'),
      'stock',v_reserve
    );
  end if;

  insert into public.order_items(
    organization_id,order_id,item_kind,product_id,basket_id,name_snapshot,sku_snapshot,
    quantity,unit_price_cents,total_cents,metadata
  )
  select
    v_session.organization_id,v_session.order_id,'product',i.product_id,null,
    i.name_snapshot,i.sku_snapshot,1,i.offered_price_cents,i.offered_price_cents,
    jsonb_build_object(
      'source','post_order_cross_sell',
      'cross_sell_session_id',v_session.id,
      'cross_sell_position',i.position,
      'source_kind',i.source_kind,
      'discount_percent',i.discount_percent,
      'expiration_date_snapshot',i.expiration_date_snapshot
    )
  from public.post_order_cross_sell_items i
  where i.session_id=v_session.id
    and i.position=any(v_positions)
    and not exists(
      select 1 from public.order_items oi
      where oi.order_id=v_session.order_id
        and oi.product_id=i.product_id
        and coalesce(oi.metadata->>'cross_sell_session_id','')=v_session.id::text
    );

  get diagnostics v_items_count=row_count;

  select coalesce(sum(i.offered_price_cents),0)::integer
    into v_added
  from public.post_order_cross_sell_items i
  where i.session_id=v_session.id and i.position=any(v_positions);

  update public.post_order_cross_sell_items
  set accepted=true,accepted_quantity=1
  where session_id=v_session.id and position=any(v_positions);

  update public.orders
  set subtotal_cents=subtotal_cents+v_added,
      total_cents=total_cents+v_added
  where id=v_session.order_id
  returning total_cents into v_new_total;

  update public.post_order_cross_sell_sessions
  set status='accepted',
      selected_numbers=to_jsonb(v_positions),
      accepted_product_count=array_length(v_positions,1),
      added_revenue_cents=v_added,
      completed_at=now(),
      updated_at=now()
  where id=v_session.id;

  insert into public.post_order_cross_sell_events(
    organization_id,session_id,order_id,event_type,payload
  ) values(
    v_session.organization_id,v_session.id,v_session.order_id,'customer_accepted',
    jsonb_build_object(
      'positions',to_jsonb(v_positions),
      'added_revenue_cents',v_added,
      'new_total_cents',v_new_total
    )
  );

  return jsonb_build_object(
    'ok',true,
    'status','accepted',
    'positions',to_jsonb(v_positions),
    'added_count',array_length(v_positions,1),
    'added_revenue_cents',v_added,
    'new_total_cents',v_new_total
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.expire_post_order_cross_sell_sessions_v1(p_organization_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_count integer := 0;
begin
  with expired as (
    update public.post_order_cross_sell_sessions s
       set status='expired',
           completed_at=coalesce(completed_at,now()),
           metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
             'expired_reason','response_window_elapsed',
             'expired_at',now()
           ),
           updated_at=now()
     where s.status in ('sent','sent_test')
       and s.expires_at is not null
       and s.expires_at<=now()
       and (p_organization_id is null or s.organization_id=p_organization_id)
     returning s.organization_id,s.id,s.order_id
  ),
  events as (
    insert into public.post_order_cross_sell_events(
      organization_id,session_id,order_id,event_type,payload
    )
    select organization_id,id,order_id,'session_expired',
           jsonb_build_object('reason','response_window_elapsed')
    from expired
    returning 1
  )
  select count(*) into v_count from events;

  return jsonb_build_object('ok',true,'expired_sessions',v_count);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.prepare_post_order_cross_sell_shadow_v1(p_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_order public.orders%rowtype;
  v_cfg public.post_order_cross_sell_config%rowtype;
  v_session_id uuid;
  v_basket_count integer := 0;
  v_basket_qty numeric := 0;
  v_standalone_lines integer := 0;
  v_standard_units numeric := 0;
  v_matched_units numeric := 0;
  v_similarity numeric(5,2) := 0;
  v_changed_lines integer := 0;
  v_classification text := 'ineligible';
  v_eligible boolean := false;
  v_reason text := null;
  v_expiry_selected integer := 0;
  v_regular_selected integer := 0;
  v_today date := (timezone('America/Cuiaba',now()))::date;
  v_min_expiration_date date := (timezone('America/Cuiaba',now()))::date;
begin
  select * into v_order from public.orders where id=p_order_id;
  if not found then return jsonb_build_object('ok',false,'error','order_not_found'); end if;

  begin
    v_min_expiration_date := greatest(
      v_today,
      nullif(v_order.delivery_address_snapshot->>'delivery_date','')::date
    );
    if v_min_expiration_date is null then v_min_expiration_date := v_today; end if;
  exception when others then
    v_min_expiration_date := v_today;
  end;

  select * into v_cfg from public.post_order_cross_sell_config where organization_id=v_order.organization_id;
  if not found then
    insert into public.post_order_cross_sell_config(organization_id,enabled,mode)
    values(v_order.organization_id,true,'shadow')
    on conflict (organization_id) do nothing;
    select * into v_cfg from public.post_order_cross_sell_config where organization_id=v_order.organization_id;
  end if;

  select count(*),coalesce(sum(quantity),0) into v_basket_count,v_basket_qty
  from public.order_items where order_id=p_order_id and item_kind='basket';

  select count(*) into v_standalone_lines
  from public.order_items where order_id=p_order_id and item_kind='product';

  with expected as (
    select bi.product_id, sum(bi.quantity * oi.quantity)::numeric as expected_qty
    from public.order_items oi
    join public.basket_items bi on bi.basket_id=oi.basket_id
    where oi.order_id=p_order_id and oi.item_kind='basket'
    group by bi.product_id
  ),
  actual as (
    select oic.product_id, sum(oic.quantity)::numeric as actual_qty
    from public.order_items oi
    join public.order_item_components oic on oic.order_item_id=oi.id
    where oi.order_id=p_order_id and oi.item_kind='basket' and oic.product_id is not null
    group by oic.product_id
  ),
  all_products as (
    select coalesce(e.product_id,a.product_id) as product_id,
           coalesce(e.expected_qty,0) as expected_qty,
           coalesce(a.actual_qty,0) as actual_qty
    from expected e full join actual a on a.product_id=e.product_id
  )
  select coalesce(sum(expected_qty),0),
         coalesce(sum(least(expected_qty,actual_qty)),0),
         count(*) filter (where abs(expected_qty-actual_qty)>0.0001)
  into v_standard_units,v_matched_units,v_changed_lines
  from all_products;

  if v_standard_units>0 then
    v_similarity:=round((v_matched_units/v_standard_units*100)::numeric,2);
  end if;

  if v_similarity>=99.99 and v_changed_lines=0 then v_classification:='normal';
  elsif v_similarity>=v_cfg.basket_similarity_min and v_changed_lines<=v_cfg.max_component_changes then v_classification:='near_normal';
  else v_classification:='modified'; end if;

  if not v_cfg.enabled or v_cfg.mode='off' then v_reason:='automation_disabled';
  elsif v_basket_count=0 then v_reason:='no_basket';
  elsif v_order.status in ('cancelled','returned','delivered') then v_reason:='terminal_order';
  elsif v_basket_qty>v_cfg.max_basket_quantity then v_reason:='bulk_basket_quantity';
  elsif v_standalone_lines>v_cfg.max_standalone_product_lines then v_reason:='too_many_standalone_products';
  elsif v_standard_units<=0 then v_reason:='basket_standard_missing';
  elsif v_classification not in ('normal','near_normal') then v_reason:='basket_too_modified';
  else v_eligible:=true; end if;

  insert into public.post_order_cross_sell_sessions(
    organization_id,order_id,mode,status,eligible,basket_similarity,basket_classification,
    changed_lines,standalone_product_lines,basket_quantity,selected_count,ineligible_reason,metadata,updated_at
  ) values(
    v_order.organization_id,p_order_id,'shadow',
    case when v_eligible then 'shadow_prepared' else 'ineligible' end,
    v_eligible,v_similarity,v_classification,v_changed_lines,v_standalone_lines,v_basket_qty,0,v_reason,
    jsonb_build_object('engine','shadow_v3','order_status',v_order.status,'evaluated_at',now()),now()
  )
  on conflict(order_id,mode) do update set
    organization_id=excluded.organization_id,status=excluded.status,eligible=excluded.eligible,
    basket_similarity=excluded.basket_similarity,basket_classification=excluded.basket_classification,
    changed_lines=excluded.changed_lines,standalone_product_lines=excluded.standalone_product_lines,
    basket_quantity=excluded.basket_quantity,selected_count=0,ineligible_reason=excluded.ineligible_reason,
    metadata=excluded.metadata,updated_at=now()
  returning id into v_session_id;

  delete from public.post_order_cross_sell_items where session_id=v_session_id;

  if v_eligible then
    with used_products as (
      select distinct product_id from (
        select oi.product_id from public.order_items oi
        where oi.order_id=p_order_id and oi.product_id is not null
        union all
        select oic.product_id from public.order_items oi
        join public.order_item_components oic on oic.order_item_id=oi.id
        where oi.order_id=p_order_id and oic.product_id is not null
      ) u
    ),
    candidates as (
      select
        p.id product_id,p.name,p.sku,p.image_url,p.sale_price_cents,p.stock_quantity,p.expiration_date,
        coalesce(p.metadata->>'sales_category',p.metadata->>'storefront_category','Outros') category,
        o.id offer_id,
        least(
          public.expiry_offer_price_cents_v1(p.sale_price_cents,p.expiration_date,v_today),
          coalesce(o.sale_price_cents,public.expiry_offer_price_cents_v1(p.sale_price_cents,p.expiration_date,v_today))
        ) as offer_price,
        public.expiry_discount_percent_v1(p.expiration_date,v_today)::numeric as discount_percent,
        p.auto_expiry_offer_enabled as public_auto_enabled,
        coalesce(o.metadata->>'source','') as existing_offer_source
      from public.products p
      left join lateral (
        select x.* from public.offers x
        where x.organization_id=p.organization_id and x.product_id=p.id and x.active=true
          and (x.starts_at is null or x.starts_at<=now())
          and (x.ends_at is null or x.ends_at>now())
        order by x.sale_price_cents asc,x.created_at desc limit 1
      ) o on true
      where p.organization_id=v_order.organization_id and p.active=true
        and coalesce(p.stock_quantity,0)>0 and p.sale_price_cents>0
        and p.expiration_date between v_min_expiration_date and (v_today+90)
        and not exists(select 1 from used_products u where u.product_id=p.id)
      order by p.expiration_date,p.stock_quantity,p.id
      limit least(v_cfg.expiry_offer_count,v_cfg.total_limit)
    )
    insert into public.post_order_cross_sell_items(
      session_id,position,product_id,source_kind,name_snapshot,sku_snapshot,image_url_snapshot,
      category_snapshot,regular_price_cents,offered_price_cents,discount_percent,
      expiration_date_snapshot,stock_snapshot,offer_id,metadata
    )
    select v_session_id,row_number() over(order by expiration_date,stock_quantity,product_id)::integer,
           product_id,'expiry_offer',name,sku,image_url,category,sale_price_cents,offer_price,
           round((1-offer_price::numeric/nullif(sale_price_cents,0))*100,2),
           expiration_date,stock_quantity,offer_id,
           jsonb_build_object(
             'source','shadow_v3',
             'pricing','expiry_rule',
             'public_auto_enabled',public_auto_enabled,
             'existing_offer_source',nullif(existing_offer_source,''),
             'private_cross_sell_quote',not public_auto_enabled
           )
    from candidates;
    get diagnostics v_expiry_selected=row_count;

    with used_products as (
      select distinct product_id from (
        select oi.product_id from public.order_items oi
        where oi.order_id=p_order_id and oi.product_id is not null
        union all
        select oic.product_id from public.order_items oi
        join public.order_item_components oic on oic.order_item_id=oi.id
        where oi.order_id=p_order_id and oic.product_id is not null
        union all
        select i.product_id from public.post_order_cross_sell_items i where i.session_id=v_session_id
      ) u
    ),
    candidates as (
      select p.id product_id,p.name,p.sku,p.image_url,p.sale_price_cents,p.stock_quantity,
             coalesce(p.metadata->>'sales_category',p.metadata->>'storefront_category','Outros') category,
             case when v_order.total_cents>0
                       and p.sale_price_cents<=floor(v_order.total_cents*v_cfg.regular_item_max_order_ratio)
                  then 0 else 1 end price_bucket,
             md5(p_order_id::text||':'||p.id::text) deterministic_key
      from public.products p
      where p.organization_id=v_order.organization_id and p.active=true
        and coalesce(p.stock_quantity,0)>0 and p.sale_price_cents>0
        and not exists(select 1 from used_products u where u.product_id=p.id)
        and not (p.expiration_date between v_today and (v_today+90))
        and not exists(
          select 1 from public.offers o
          where o.organization_id=p.organization_id and o.product_id=p.id and o.active=true
            and (o.starts_at is null or o.starts_at<=now())
            and (o.ends_at is null or o.ends_at>now())
        )
    ),
    ranked as (
      select c.*,row_number() over(partition by category order by price_bucket,deterministic_key) category_rank
      from candidates c
    ),
    chosen as (
      select * from ranked
      order by category_rank,price_bucket,deterministic_key
      limit greatest(0,v_cfg.total_limit-v_expiry_selected)
    )
    insert into public.post_order_cross_sell_items(
      session_id,position,product_id,source_kind,name_snapshot,sku_snapshot,image_url_snapshot,
      category_snapshot,regular_price_cents,offered_price_cents,discount_percent,
      expiration_date_snapshot,stock_snapshot,offer_id,metadata
    )
    select v_session_id,
           (v_expiry_selected+row_number() over(order by category_rank,price_bucket,deterministic_key))::integer,
           product_id,'regular',name,sku,image_url,category,sale_price_cents,sale_price_cents,0,
           null,stock_quantity,null,jsonb_build_object('source','shadow_v2','selection','deterministic_diversity')
    from chosen;
    get diagnostics v_regular_selected=row_count;

    update public.post_order_cross_sell_sessions
    set selected_count=v_expiry_selected+v_regular_selected,updated_at=now()
    where id=v_session_id;
  end if;

  insert into public.post_order_cross_sell_events(organization_id,session_id,order_id,event_type,payload)
  values(v_order.organization_id,v_session_id,p_order_id,
    case when v_eligible then 'shadow_prepared' else 'shadow_ineligible' end,
    jsonb_build_object('engine','shadow_v3','classification',v_classification,'similarity',v_similarity,
      'changed_lines',v_changed_lines,'reason',v_reason,'expiry_selected',v_expiry_selected,
      'regular_selected',v_regular_selected));

  return jsonb_build_object('ok',true,'session_id',v_session_id,'eligible',v_eligible,
    'classification',v_classification,'similarity',v_similarity,'changed_lines',v_changed_lines,
    'reason',v_reason,'selected_count',v_expiry_selected+v_regular_selected,
    'expiry_selected',v_expiry_selected,'regular_selected',v_regular_selected);
end;
$function$
;

create index if not exists post_order_cross_sell_sessions_open_idx
  on public.post_order_cross_sell_sessions(status,expires_at,sent_at desc)
  where status in ('sent','sent_test');

revoke all on function public.prepare_post_order_cross_sell_shadow_v1(uuid) from public,anon,authenticated;
revoke all on function public.accept_post_order_cross_sell_v1(uuid,integer[]) from public,anon,authenticated;
revoke all on function public.expire_post_order_cross_sell_sessions_v1(uuid) from public,anon,authenticated;

grant execute on function public.prepare_post_order_cross_sell_shadow_v1(uuid) to service_role;
grant execute on function public.accept_post_order_cross_sell_v1(uuid,integer[]) to service_role;
grant execute on function public.expire_post_order_cross_sell_sessions_v1(uuid) to service_role;
