-- Cross-sell expiry quotes V3
-- Keeps public storefront offers opt-in while allowing private post-order expiry quotes.
CREATE OR REPLACE FUNCTION public.expiry_discount_percent_v1(p_expiration_date date, p_reference_date date)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select case
    when p_expiration_date is null or p_reference_date is null then 0
    when p_expiration_date < p_reference_date or p_expiration_date > p_reference_date + 90 then 0
    when (p_expiration_date-p_reference_date) < 30 then 40
    when (p_expiration_date-p_reference_date) < 60 then 20
    else 10
  end;
$function$


CREATE OR REPLACE FUNCTION public.expiry_offer_price_cents_v1(p_sale_price_cents integer, p_expiration_date date, p_reference_date date)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select case
    when coalesce(p_sale_price_cents,0)<=0 then 0
    when public.expiry_discount_percent_v1(p_expiration_date,p_reference_date)<=0 then p_sale_price_cents
    else greatest(
      1,
      round(
        p_sale_price_cents::numeric *
        (100-public.expiry_discount_percent_v1(p_expiration_date,p_reference_date)) / 100
      )::integer
    )
  end;
$function$


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
begin
  select * into v_order from public.orders where id=p_order_id;
  if not found then return jsonb_build_object('ok',false,'error','order_not_found'); end if;

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
        and p.expiration_date between v_today and (v_today+90)
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


revoke all on function public.expiry_discount_percent_v1(date,date) from public,anon,authenticated;
revoke all on function public.expiry_offer_price_cents_v1(integer,date,date) from public,anon,authenticated;
revoke all on function public.prepare_post_order_cross_sell_shadow_v1(uuid) from public,anon,authenticated;
grant execute on function public.expiry_discount_percent_v1(date,date) to service_role;
grant execute on function public.expiry_offer_price_cents_v1(integer,date,date) to service_role;
grant execute on function public.prepare_post_order_cross_sell_shadow_v1(uuid) to service_role;
