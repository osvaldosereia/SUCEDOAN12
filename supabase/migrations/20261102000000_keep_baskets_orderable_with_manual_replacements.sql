CREATE OR REPLACE FUNCTION public.handle_basket_product_unavailable_v1(p_product_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
declare
  r record;
  candidate record;
  v_keep_active boolean:=false;
  v_stock numeric;
begin
  for r in
    select opt.id as option_id,opt.position_id,opt.sort_order,
           pos.quantity,coalesce(opt.metadata,'{}'::jsonb) as metadata
    from public.basket_mold_position_options opt
    join public.basket_mold_positions pos on pos.id=opt.position_id
    join public.basket_molds mold on mold.id=pos.mold_id
    join public.basket_templates basket on basket.id=mold.basket_id
    where opt.product_id=p_product_id and basket.is_active=true
    order by opt.position_id,opt.sort_order,opt.id
  loop
    -- Prefer the next configured option that is active and covers the position.
    select opt.id,opt.product_id,opt.sort_order,p.is_active,
           public.basket_component_fresh_sellable_stock_v1(p.id) as stock
      into candidate
    from public.basket_mold_position_options opt
    join public.products p on p.id=opt.product_id
    where opt.position_id=r.position_id and opt.id<>r.option_id
      and p.is_active=true
      and coalesce(public.basket_component_fresh_sellable_stock_v1(p.id),0)>=r.quantity
    order by case when (opt.sort_order,opt.product_id)>(r.sort_order,p_product_id) then 0 else 1 end,
             opt.sort_order,opt.product_id
    limit 1;

    -- If none can cover the basket, use the next active configured option and flag it for review.
    if not found then
      select opt.id,opt.product_id,opt.sort_order,p.is_active,
             public.basket_component_fresh_sellable_stock_v1(p.id) as stock
        into candidate
      from public.basket_mold_position_options opt
      join public.products p on p.id=opt.product_id
      where opt.position_id=r.position_id and opt.id<>r.option_id
        and p.is_active=true
      order by case when (opt.sort_order,opt.product_id)>(r.sort_order,p_product_id) then 0 else 1 end,
               opt.sort_order,opt.product_id
      limit 1;
    end if;

    -- If every remaining variation is inactive, keep one configured option for manual correction.
    if not found then
      select opt.id,opt.product_id,opt.sort_order,p.is_active,
             public.basket_component_fresh_sellable_stock_v1(p.id) as stock
        into candidate
      from public.basket_mold_position_options opt
      join public.products p on p.id=opt.product_id
      where opt.position_id=r.position_id and opt.id<>r.option_id
      order by case when (opt.sort_order,opt.product_id)>(r.sort_order,p_product_id) then 0 else 1 end,
               opt.sort_order,opt.product_id
      limit 1;
    end if;

    if not found then
      update public.basket_mold_position_options
      set metadata=(coalesce(metadata,'{}'::jsonb)-'manual_replacement_reason')
        ||jsonb_build_object('manual_replacement_required',true,
                             'manual_replacement_reason','only_configured_option_unavailable')
      where id=r.option_id;
      v_keep_active:=true;
      continue;
    end if;

    delete from public.basket_mold_position_options where id=r.option_id;

    update public.basket_mold_position_options
    set metadata=(coalesce(metadata,'{}'::jsonb)-'manual_replacement_required'-'manual_replacement_reason')
          ||jsonb_build_object('preferred',(id=candidate.id)),
        updated_at=now()
    where position_id=r.position_id;

    with ordered as (
      select id,(row_number() over(order by case when id=candidate.id then 0 else 1 end,
                                            sort_order,product_id)-1)::integer as next_order
      from public.basket_mold_position_options
      where position_id=r.position_id
    )
    update public.basket_mold_position_options opt
    set sort_order=ordered.next_order,updated_at=now()
    from ordered where opt.id=ordered.id;

    v_stock:=coalesce(candidate.stock,0);
    if candidate.is_active is not true or v_stock<r.quantity then
      update public.basket_mold_position_options
      set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
        'manual_replacement_required',true,
        'manual_replacement_reason',case
          when candidate.is_active is not true then 'replacement_product_inactive'
          else 'replacement_has_no_sellable_stock'
        end
      )
      where id=candidate.id;
    end if;
  end loop;

  return v_keep_active;
end;
$function$;

REVOKE ALL ON FUNCTION public.handle_basket_product_unavailable_v1(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.handle_basket_product_unavailable_v1(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.enforce_zero_stock_inactive()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
declare
  v_authority text:='legacy_shadow';
  v_keep_active boolean:=false;
begin
  select coalesce(metadata->>'ops2_stock_authority','legacy_shadow')
    into v_authority
  from public.bling_hub_runtime_v2 where id=1;

  if new.stock is not null and new.stock<=0 then
    v_keep_active:=public.handle_basket_product_unavailable_v1(new.id);
    if v_keep_active then
      new.is_active:=true;
      new.is_whatsapp_active:=false;
    elsif v_authority<>'bling' then
      new.is_active:=false;
      new.is_whatsapp_active:=false;
    end if;
  elsif new.is_active is false then
    v_keep_active:=public.handle_basket_product_unavailable_v1(new.id);
    if v_keep_active then
      new.is_active:=true;
      new.is_whatsapp_active:=false;
    end if;
  end if;

  return new;
end
$function$;

DROP TRIGGER IF EXISTS trg_products_zero_stock_inactive ON public.products;
CREATE TRIGGER trg_products_zero_stock_inactive
BEFORE INSERT OR UPDATE OF stock,is_active ON public.products
FOR EACH ROW EXECUTE FUNCTION public.enforce_zero_stock_inactive();

-- Reconcile only active basket options already inactive or without sufficient fresh stock.
UPDATE public.products p
SET stock=p.stock
WHERE EXISTS(
  SELECT 1
  FROM public.basket_mold_position_options opt
  JOIN public.basket_mold_positions pos ON pos.id=opt.position_id
  JOIN public.basket_molds mold ON mold.id=pos.mold_id
  JOIN public.basket_templates basket ON basket.id=mold.basket_id AND basket.is_active=true
  WHERE opt.product_id=p.id
    AND (p.is_active=false OR coalesce(public.basket_component_fresh_sellable_stock_v1(p.id),0)<pos.quantity)
);

CREATE OR REPLACE FUNCTION public.basket_mold_public_compositions_batch_v1(p_basket_ids uuid[])
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
with requested as (
  select distinct unnest(coalesce(p_basket_ids, '{}'::uuid[])) as basket_id
), mold as (
  select m.id, m.basket_id, m.hidden_adjustment, m.public_composition_count, b.name, b.image_url,
         (cat.slug='cestas-completas') as is_complete
  from public.basket_molds m
  join public.basket_templates b on b.id = m.basket_id
  join public.basket_categories cat on cat.id=b.category_id
  join requested r on r.basket_id = m.basket_id
), active_order_reservations as (
  select r.product_id, coalesce(sum(r.quantity), 0)::numeric as reserved
  from public.vitrine_stock_reservations r
  where r.status in ('reserved', 'allocated')
    and (r.expires_at is null or r.expires_at > now())
  group by r.product_id
), stock_candidates as (
  select distinct opt.product_id
  from mold m
  join public.basket_mold_positions pos on pos.mold_id = m.id
  join public.basket_mold_position_options opt on opt.position_id = pos.id
  join public.ops2_loose_sellable_stock_v1 s on s.product_id = opt.product_id
), fresh_stock as materialized (
  select sc.product_id,
         public.basket_component_fresh_sellable_stock_v1(sc.product_id) as sellable_stock
  from stock_candidates sc
), eligible as (
  select pos.id as position_id, pos.mold_id, m.basket_id, pos.label, pos.quantity,
         pos.sort_order as position_order, opt.product_id, opt.sort_order as option_order,
         (coalesce(opt.metadata, '{}'::jsonb) @> '{"preferred":true}'::jsonb) as is_preferred,
         p.name as product_name, p.sku, p.gtin, p.image_url, m.is_complete,
         case when p.is_offer=true and p.offer_price>0 then p.offer_price
              when p.price>0 then p.price else 9999999 end as unit_price,
         greatest(0, fs.sellable_stock
           - coalesce(orr.reserved, 0))::numeric as available_stock
  from mold m
  join public.basket_mold_positions pos on pos.mold_id = m.id
  join public.basket_mold_position_options opt on opt.position_id = pos.id
  join public.products p on p.id = opt.product_id
  join fresh_stock fs on fs.product_id = p.id
  left join active_order_reservations orr on orr.product_id = p.id
  where p.is_active is true
    and greatest(0, fs.sellable_stock
      - coalesce(orr.reserved, 0)) >= pos.quantity
), scored as (
  select e.*, floor(e.available_stock / nullif(e.quantity, 0))::bigint as coverage_baskets
  from eligible e
), ranked as (
  select s.*,
         row_number() over (partition by s.position_id order by
           case when s.is_complete and s.is_preferred then 0 else 1 end,
           case when s.is_complete then s.unit_price end asc nulls last,
           case when not s.is_complete and s.is_preferred then 0 else 1 end,
           case when not s.is_complete then s.coverage_baskets end desc nulls last,
           case when not s.is_complete then s.available_stock end desc nulls last,
           s.option_order, s.product_id) as option_rank,
         bool_or(s.is_preferred) over (partition by s.position_id) as has_preferred,
         count(*) filter (where s.is_preferred) over (partition by s.position_id) as preferred_count,
         count(*) over (partition by s.position_id) as option_count
  from scored s
  where s.coverage_baskets >= 1
), slots as (
  select m.basket_id, gs as composition_number
  from mold m cross join lateral generate_series(1, m.public_composition_count) gs
), chosen as (
  select sl.composition_number, r.*,
         (r.coverage_baskets::numeric / greatest(1, ceil(sl.composition_number::numeric / r.option_count)))::numeric as selection_score
  from slots sl
  join ranked r on r.basket_id = sl.basket_id
    and r.option_rank = case
      when r.is_complete then case when sl.composition_number <= r.option_count then sl.composition_number else 1 end
      when r.preferred_count > 0 then ((sl.composition_number - 1) % r.preferred_count) + 1
      when sl.composition_number <= r.option_count then sl.composition_number
      else 1 end
), compositions as (
  select c.basket_id, c.composition_number,
         jsonb_agg(jsonb_build_object(
           'position_id', c.position_id, 'label', c.label, 'quantity', c.quantity,
           'product_id', c.product_id, 'name', c.product_name, 'sku', c.sku,
           'gtin', c.gtin, 'image_url', c.image_url, 'available_stock', c.available_stock,
           'coverage_baskets', c.coverage_baskets, 'option_rank', c.option_rank,
           'selection_score', c.selection_score,
           'selection_reason', case
             when c.is_preferred then 'preferred_in_stock'
             when c.is_complete and c.option_rank=1 then 'lowest_price_in_stock'
             when c.is_complete then 'price_ascending_alternative'
             when c.is_preferred then 'preferred_in_stock'
             when c.composition_number <= c.option_count then 'distinct_by_coverage'
             else 'highest_coverage_repeat' end
         ) order by c.position_order, c.position_id) as items
  from chosen c
  group by c.basket_id, c.composition_number
)
select coalesce(jsonb_agg(jsonb_build_object(
  'basket_id', m.basket_id, 'name', m.name, 'image_url', m.image_url,
  'hidden_adjustment', m.hidden_adjustment,
  'public_composition_count', m.public_composition_count,
  'balancing', 'loose_sellable_coverage_v3',
  'compositions', coalesce((
    select jsonb_agg(jsonb_build_object('number', c.composition_number, 'items', c.items)
      order by c.composition_number)
    from compositions c where c.basket_id = m.basket_id
  ), '[]'::jsonb)
) order by m.basket_id), '[]'::jsonb)
from mold m;
$function$
;

CREATE OR REPLACE FUNCTION public.create_vitrine_cart_order_v3_base(p_phone text, p_payment_method text, p_items jsonb, p_customer_snapshot jsonb DEFAULT '{}'::jsonb, p_delivery jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_phone text;
  v_customer_id uuid;
  v_order_id uuid:=gen_random_uuid();
  v_order_number text;
  v_payment_code text;
  v_payment_label text;
  v_cart jsonb:=coalesce(p_items,'[]'::jsonb);
  v_customer jsonb:=coalesce(p_customer_snapshot,'{}'::jsonb);
  v_delivery jsonb:=coalesce(p_delivery,'{}'::jsonb);
  v_line jsonb;
  v_components jsonb;
  v_basket public.basket_templates%rowtype;
  v_product public.products%rowtype;
  v_line_qty numeric;
  v_product_id uuid;
  v_unit numeric;
  v_line_total numeric;
  v_total numeric(14,2):=0;
  v_fiscal numeric(14,2):=0;
  v_item_rows jsonb:='[]'::jsonb;
  v_alloc_rows jsonb:='[]'::jsonb;
  v_sep_rows jsonb:='[]'::jsonb;
  v_loose_demand jsonb:='{}'::jsonb;
  v_lot_demand jsonb:='{}'::jsonb;
  v_current_demand numeric;
  v_mold_component_demand numeric;
  v_existing_stock numeric;
  v_pair record;
  v_basket_unit numeric;
  v_basket_fiscal_unit numeric;
  v_group text;
  v_group_lot_id uuid;
  v_group_kind text;
  v_group_changed boolean;
  v_group_short text;
  v_food_lot_id uuid;
  v_hygiene_lot_id uuid;
  v_food_changed boolean:=false;
  v_hygiene_changed boolean:=false;
  v_food_short text:=null;
  v_hygiene_short text:=null;
  v_lot_requested integer;
  v_li record;
  v_selected_qty numeric;
  v_base_qty numeric;
  v_min numeric;
  v_max numeric;
  v_delta numeric;
  v_preassembled_units numeric;
  v_loose_units numeric;
  v_component_snapshot jsonb;
  v_addr jsonb;
  v_first_basket uuid:=null;
  v_basket_names text[]:='{}'::text[];
  v_all_split boolean;
  v_legacy_lot_id uuid;
  v_legacy_lot public.basket_stock_lots%rowtype;
  v_supplied boolean;
  v_selected jsonb;
  v_mold public.basket_molds%rowtype;
  v_mold_position record;
  v_mold_component_count integer;
  v_mold_position_count integer;
  v_composition_number integer;
  v_conditional_hidden_applied numeric:=0;
  v_mold_pricing_model text;
  v_mold_public_data jsonb;
  v_mold_public_composition jsonb;
  v_mold_configured_product_total numeric:=0;
  v_mold_configured_base numeric:=0;
  v_mold_initial_product_total numeric:=0;
  v_mold_configured_conditional numeric:=0;
  v_mold_initial_conditional numeric:=0;
  v_mold_initial_item_count integer:=0;
  v_mold_selection_delta numeric:=0;
  v_manual_replacement_required boolean:=false;
  v_replacement_product_id uuid;
  v_requested_sort_order integer;

begin
  if nullif(btrim(coalesce(p_phone,'')),'') is null then
    v_phone:=null;
  else
    v_phone:=public.normalize_storefront_phone_v2(p_phone);
  end if;
  if jsonb_typeof(v_cart)<>'array' or jsonb_array_length(v_cart)=0 then raise exception 'cart_empty'; end if;
  if jsonb_array_length(v_cart)>80 then raise exception 'too_many_items'; end if;

  -- O formato do lote é decidido por item. Não existe mais chave global legacy/split.
  v_all_split:=true;

  v_payment_label:=trim(coalesce(p_payment_method,''));
  v_payment_code:=case v_payment_label
    when 'PIX' then 'pix'
    when 'Dinheiro' then 'cash'
    when 'Cartão de crédito' then 'credit_card'
    when 'Cartão alimentação/refeição' then 'food_card'
    else null
  end;
  if v_payment_label<>'' and v_payment_code is null then raise exception 'invalid_payment'; end if;

  begin
    if coalesce(v_customer->>'id','')<>'' then
      v_customer_id:=(v_customer->>'id')::uuid;
      if not exists(select 1 from public.customers where id=v_customer_id) then v_customer_id:=null; end if;
    end if;
  exception when others then v_customer_id:=null;
  end;
  if v_customer_id is null then
    select id into v_customer_id from public.customers where primary_whatsapp_e164=v_phone limit 1;
  end if;
  if v_customer_id is null then
    select customer_id into v_customer_id
    from public.customer_phones where phone_e164=v_phone
    order by is_primary desc,created_at asc limit 1;
  end if;

  for v_line in select value from jsonb_array_elements(v_cart) loop
    if jsonb_typeof(v_line)<>'object' then raise exception 'item_must_be_object'; end if;
    if coalesce(v_line->>'type','product') not in ('product','basket','basket_mold') then raise exception 'invalid_item_type'; end if;
    begin v_line_qty:=coalesce(nullif(v_line->>'qty','')::numeric,1);
    exception when others then raise exception 'invalid_quantity'; end;
    if v_line_qty<=0 or v_line_qty>30 or trunc(v_line_qty)<>v_line_qty then raise exception 'invalid_quantity'; end if;

    if coalesce(v_line->>'type','product')='product' then
      begin v_product_id:=(v_line->>'id')::uuid;
      exception when others then raise exception 'invalid_product_id'; end;
      select * into v_product from public.products where id=v_product_id and is_active=true;
      if not found or v_product.price is null then raise exception 'product_unavailable'; end if;
      select case when stock_authority='bling' then loose_sellable_stock else coalesce(ean_sellable_stock,loose_sellable_stock) end into v_existing_stock
      from public.storefront_ean_sellable_stock_v1
      where product_id=v_product.id and is_active=true;
      if coalesce(v_existing_stock,0)<=0 then raise exception 'product_unavailable'; end if;

      v_unit:=case when v_product.is_offer=true and v_product.offer_price is not null and v_product.offer_price>=0
                   then v_product.offer_price else v_product.price end;
      v_line_total:=round(v_unit*v_line_qty,2);
      v_total:=v_total+v_line_total;
      v_fiscal:=v_fiscal+v_line_total;
      v_current_demand:=coalesce((v_loose_demand->>v_product.id::text)::numeric,0)+v_line_qty;
      v_loose_demand:=jsonb_set(v_loose_demand,array[v_product.id::text],to_jsonb(v_current_demand),true);
      v_item_rows:=v_item_rows||jsonb_build_array(jsonb_build_object(
        'product_id',v_product.id,'sku',v_product.sku,'name',v_product.name,
        'quantity',v_line_qty,'unit_price',v_unit,'line_total',v_line_total,
        'metadata',jsonb_build_object(
          'source','vitrine_direct','history_kind','product',
          'image_url',coalesce(v_product.image_url,'')
        )
      ));
      continue;
    end if;

    if coalesce(v_line->>'type','product')='basket_mold' then
      v_mold_pricing_model:=coalesce(nullif(v_line->>'pricing_model',''),'legacy_component_sum_v1');
      v_mold_public_data:=null;
      v_mold_public_composition:=null;
      v_mold_configured_product_total:=0;
      v_mold_configured_base:=0;
      v_mold_initial_product_total:=0;
      v_mold_configured_conditional:=0;
      v_mold_initial_conditional:=0;
      v_mold_initial_item_count:=0;
      v_mold_selection_delta:=0;

      begin
        select * into v_basket
        from public.basket_templates
        where id=(v_line->>'id')::uuid and is_active=true;
      exception when others then raise exception 'invalid_basket_id'; end;
      if not found then
        -- Recover saved carts only from an exact, unambiguous position set.
        -- Products, quantities, prices and stock are still validated below.
        v_components:=coalesce(v_line->'components','[]'::jsonb);
        if jsonb_typeof(v_components)<>'array' or jsonb_array_length(v_components)=0 then
          raise exception 'basket_mold_unavailable';
        end if;
        select * into v_basket from public.basket_templates
        where is_active=true and id=(
          select min(candidate.basket_id::text)::uuid
          from (
            select m.basket_id
            from public.basket_molds m
            join public.basket_templates b on b.id=m.basket_id and b.is_active=true
            join public.basket_mold_positions pos on pos.mold_id=m.id
            group by m.basket_id,m.id
            having count(*)=jsonb_array_length(v_components)
               and count(*)=(select count(distinct c->>'position_id') from jsonb_array_elements(v_components) c)
               and bool_and(exists(select 1 from jsonb_array_elements(v_components) c where c->>'position_id'=pos.id::text))
          ) candidate
          having count(*)=1
        );
        if not found then raise exception 'basket_mold_unavailable'; end if;
      end if;

      select * into v_mold from public.basket_molds where basket_id=v_basket.id;
      if not found then raise exception 'basket_mold_not_configured'; end if;
      if not public.basket_mold_cutover_ready_v1(v_basket.id) then
        raise exception 'basket_mold_legacy_pending';
      end if;

      begin v_composition_number:=coalesce(nullif(v_line->>'composition_number','')::integer,1);
      exception when others then raise exception 'basket_mold_composition_invalid'; end;
      if v_composition_number<1 or v_composition_number>v_mold.public_composition_count then
        raise exception 'basket_mold_composition_invalid';
      end if;

      v_components:=coalesce(v_line->'components','[]'::jsonb);
      if jsonb_typeof(v_components)<>'array' then raise exception 'basket_mold_components_required'; end if;
      select count(*) into v_mold_position_count from public.basket_mold_positions where mold_id=v_mold.id;
      if v_mold_position_count=0 or jsonb_array_length(v_components)<>v_mold_position_count then
        raise exception 'basket_mold_component_invalid';
      end if;

      if exists(
        select 1 from jsonb_array_elements(v_components) c
        where not exists(
          select 1 from public.basket_mold_positions pos
          where pos.mold_id=v_mold.id and pos.id::text=c->>'position_id'
        )
      ) then raise exception 'basket_mold_component_invalid'; end if;

      if v_mold_pricing_model='configured_base_delta_v1' then
        v_mold_public_data:=public.basket_mold_public_compositions_v2(v_basket.id);
        select comp.value into v_mold_public_composition
        from jsonb_array_elements(coalesce(v_mold_public_data->'compositions','[]'::jsonb)) comp(value)
        where coalesce(nullif(comp.value->>'number','')::integer,0)=v_composition_number
        limit 1;
        if not found or v_mold_public_composition is null then
          select jsonb_build_object(
            'items',coalesce(jsonb_agg(jsonb_build_object(
              'position_id',pos.id,'product_id',configured.product_id
            ) order by pos.sort_order,pos.id),'[]'::jsonb)
          )
          into v_mold_public_composition
          from public.basket_mold_positions pos
          join lateral(
            select opt_row.product_id
            from public.basket_mold_position_options opt_row
            where opt_row.position_id=pos.id
            order by case when coalesce(opt_row.metadata,'{}'::jsonb) @> '{"preferred":true}'::jsonb then 0 else 1 end,
                     opt_row.sort_order,opt_row.product_id
            limit 1
          ) configured on true
          where pos.mold_id=v_mold.id;
        end if;
        if v_mold_public_composition is null then
          raise exception 'basket_mold_composition_invalid';
        end if;
        if jsonb_typeof(v_mold_public_composition->'items')<>'array' then
          raise exception 'basket_mold_composition_invalid';
        end if;
        if jsonb_array_length(v_mold_public_composition->'items')<>v_mold_position_count then
          raise exception 'basket_mold_composition_invalid';
        end if;
        select count(distinct item.value->>'position_id') into v_mold_initial_item_count
        from jsonb_array_elements(v_mold_public_composition->'items') item(value)
        where exists(
          select 1 from public.basket_mold_positions pos
          where pos.mold_id=v_mold.id and pos.id::text=item.value->>'position_id'
        );
        if v_mold_initial_item_count<>v_mold_position_count then
          raise exception 'basket_mold_composition_invalid';
        end if;

        select coalesce(sum(round(round(
          (case when configured_product.is_offer=true
                      and configured_product.offer_price is not null
                      and configured_product.offer_price>=0
                then configured_product.offer_price else configured_product.price end)*100
        )*pos_row.quantity/100,2)),0)
        into v_mold_configured_product_total
        from public.basket_mold_positions pos_row
        join lateral(
          select opt_row.product_id
          from public.basket_mold_position_options opt_row
          where opt_row.position_id=pos_row.id
          order by opt_row.sort_order,opt_row.product_id
          limit 1
        ) configured on true
        join public.products configured_product on configured_product.id=configured.product_id
        where pos_row.mold_id=v_mold.id;

        if coalesce(v_mold.conditional_hidden_enabled,false)
           and v_mold.conditional_hidden_product_id is not null
           and coalesce(v_mold.conditional_hidden_adjustment,0)>0
           and exists(
             select 1
             from public.basket_mold_positions pos_row
             join lateral(
               select opt_row.product_id
               from public.basket_mold_position_options opt_row
               where opt_row.position_id=pos_row.id
               order by opt_row.sort_order,opt_row.product_id
               limit 1
             ) configured on true
             where pos_row.mold_id=v_mold.id
               and configured.product_id=v_mold.conditional_hidden_product_id
               and pos_row.quantity>0
           )
        then
          v_mold_configured_conditional:=round(v_mold.conditional_hidden_adjustment,2);
        end if;

        v_mold_configured_base:=round(
          v_mold_configured_product_total
          +coalesce(v_mold.hidden_adjustment,0)
          +v_mold_configured_conditional,2
        );

        select coalesce(sum(round(round(
          (case when initial_product.is_offer=true
                      and initial_product.offer_price is not null
                      and initial_product.offer_price>=0
                then initial_product.offer_price else initial_product.price end)*100
        )*pos_row.quantity/100,2)),0)
        into v_mold_initial_product_total
        from public.basket_mold_positions pos_row
        join jsonb_array_elements(v_mold_public_composition->'items') initial_item(value)
          on initial_item.value->>'position_id'=pos_row.id::text
        join public.products initial_product
          on initial_product.id=nullif(initial_item.value->>'product_id','')::uuid
        where pos_row.mold_id=v_mold.id;

        if coalesce(v_mold.conditional_hidden_enabled,false)
           and v_mold.conditional_hidden_product_id is not null
           and coalesce(v_mold.conditional_hidden_adjustment,0)>0
           and exists(
             select 1
             from public.basket_mold_positions pos_row
             join jsonb_array_elements(v_mold_public_composition->'items') initial_item(value)
               on initial_item.value->>'position_id'=pos_row.id::text
             where pos_row.mold_id=v_mold.id
               and nullif(initial_item.value->>'product_id','')::uuid=v_mold.conditional_hidden_product_id
               and pos_row.quantity>0
           )
        then
          v_mold_initial_conditional:=round(v_mold.conditional_hidden_adjustment,2);
        end if;
      end if;

      v_basket_unit:=coalesce(v_mold.hidden_adjustment,0);
      v_basket_fiscal_unit:=0;
      v_component_snapshot:='[]'::jsonb;

      for v_mold_position in
        select id,label,quantity,sort_order
        from public.basket_mold_positions
        where mold_id=v_mold.id
        order by sort_order,id
      loop
        select count(*) into v_mold_component_count
        from jsonb_array_elements(v_components) c
        where c->>'position_id'=v_mold_position.id::text;
        if v_mold_component_count<>1 then raise exception 'basket_mold_component_invalid'; end if;

        select value into v_selected
        from jsonb_array_elements(v_components)
        where value->>'position_id'=v_mold_position.id::text
        limit 1;

        begin v_product_id:=nullif(v_selected->>'product_id','')::uuid;
        exception when others then raise exception 'basket_mold_component_invalid'; end;
        if v_product_id is null then raise exception 'basket_mold_option_invalid'; end if;
        select opt_row.sort_order into v_requested_sort_order
        from public.basket_mold_position_options opt_row
        where opt_row.position_id=v_mold_position.id and opt_row.product_id=v_product_id;
        if not found then
          select opt_row.product_id,opt_row.sort_order
          into v_product_id,v_requested_sort_order
          from public.basket_mold_position_options opt_row
          where opt_row.position_id=v_mold_position.id
          order by case when coalesce(opt_row.metadata,'{}'::jsonb) @> '{"preferred":true}'::jsonb then 0 else 1 end,
                   opt_row.sort_order,opt_row.product_id
          limit 1;
        end if;
        if v_product_id is null then raise exception 'basket_mold_option_invalid'; end if;

        select * into v_product from public.products where id=v_product_id;
        if not found or v_product.price is null then raise exception 'basket_mold_option_invalid'; end if;

        begin
          v_selected_qty:=coalesce(nullif(v_selected->>'quantity','')::numeric,v_mold_position.quantity);
        exception when others then raise exception 'invalid_basket_quantity'; end;
        if v_selected_qty<0 or v_selected_qty>1000 or trunc(v_selected_qty)<>v_selected_qty then raise exception 'invalid_basket_quantity'; end if;
        select public.basket_component_fresh_sellable_stock_v1(v_product.id) into v_existing_stock;
        if v_product.is_active is not true or coalesce(v_existing_stock,0)<v_selected_qty*v_line_qty then
          select opt_row.product_id into v_replacement_product_id
          from public.basket_mold_position_options opt_row
          join public.products replacement_product on replacement_product.id=opt_row.product_id
          where opt_row.position_id=v_mold_position.id
            and replacement_product.is_active=true
            and public.basket_component_fresh_sellable_stock_v1(replacement_product.id)>=v_selected_qty*v_line_qty
          order by case
                     when (opt_row.sort_order,opt_row.product_id)>(coalesce(v_requested_sort_order,-1),v_product_id) then 0
                     else 1
                   end,
                   opt_row.sort_order,opt_row.product_id
          limit 1;
          if found then
            v_product_id:=v_replacement_product_id;
            select * into v_product from public.products where id=v_product_id;
            select public.basket_component_fresh_sellable_stock_v1(v_product.id) into v_existing_stock;
          end if;
        end if;
        v_manual_replacement_required:=v_product.is_active is not true
          or coalesce(v_existing_stock,0)<v_selected_qty*v_line_qty;
        if v_selected_qty=0 then
          v_component_snapshot:=v_component_snapshot||jsonb_build_array(jsonb_build_object(
            'position_id',v_mold_position.id,'label',v_mold_position.label,
            'product_id',v_product.id,'quantity',0
          ));
          continue;
        end if;

        v_unit:=case when v_product.is_offer=true and v_product.offer_price is not null and v_product.offer_price>=0
                     then v_product.offer_price else v_product.price end;
        v_line_total:=round(v_unit*v_selected_qty*v_line_qty,2);
        v_basket_fiscal_unit:=v_basket_fiscal_unit+round(v_unit*v_selected_qty,2);
        v_basket_unit:=v_basket_unit+round(v_unit*v_selected_qty,2);
        if not v_manual_replacement_required then
          v_current_demand:=coalesce((v_loose_demand->>v_product.id::text)::numeric,0)+(v_selected_qty*v_line_qty);
          v_loose_demand:=jsonb_set(v_loose_demand,array[v_product.id::text],to_jsonb(v_current_demand),true);
        end if;

        v_item_rows:=v_item_rows||jsonb_build_array(jsonb_build_object(
          'product_id',v_product.id,'sku',v_product.sku,'name',v_product.name,
          'quantity',v_selected_qty*v_line_qty,'unit_price',v_unit,'line_total',v_line_total,
          'metadata',jsonb_build_object(
            'source','vitrine_direct','history_kind','basket_mold_component',
            'basket_id',v_basket.id,'basket_name',v_basket.name,'basket_quantity',v_line_qty,
            'mold_id',v_mold.id,'position_id',v_mold_position.id,'position_label',v_mold_position.label,
            'composition_number',v_composition_number,'selected_quantity',v_selected_qty,
            'image_url',coalesce(v_product.image_url,''),
            'manual_replacement_required',v_manual_replacement_required,
            'manual_replacement_reason',case when v_manual_replacement_required then 'no_available_basket_option' else null end
          )
        ));
        v_component_snapshot:=v_component_snapshot||jsonb_build_array(jsonb_build_object(
          'position_id',v_mold_position.id,'label',v_mold_position.label,
          'product_id',v_product.id,'quantity',v_selected_qty
        ));
      end loop;

      v_conditional_hidden_applied:=0;
      if coalesce(v_mold.conditional_hidden_enabled,false)
         and v_mold.conditional_hidden_product_id is not null
         and coalesce(v_mold.conditional_hidden_adjustment,0)>0
         and exists(
           select 1
           from jsonb_array_elements(v_component_snapshot) c
           where c->>'product_id'=v_mold.conditional_hidden_product_id::text
             and coalesce(nullif(c->>'quantity','')::numeric,0)>0
         )
      then
        v_conditional_hidden_applied:=round(v_mold.conditional_hidden_adjustment,2);
        v_basket_unit:=v_basket_unit+v_conditional_hidden_applied;
      end if;

      if v_mold_pricing_model='configured_base_delta_v1' then
        v_mold_selection_delta:=round(v_basket_fiscal_unit-v_mold_initial_product_total,2);
        v_basket_unit:=greatest(0,round(
          v_mold_configured_base
          +v_mold_selection_delta
          +v_conditional_hidden_applied
          -v_mold_initial_conditional,2
        ));
      end if;

      if v_basket_unit<0 then raise exception 'invalid_order_total'; end if;
      if v_first_basket is null then v_first_basket:=v_basket.id; end if;
      if not (v_basket.name=any(v_basket_names)) then v_basket_names:=array_append(v_basket_names,v_basket.name); end if;
      v_total:=v_total+round(v_basket_unit*v_line_qty,2);
      v_fiscal:=v_fiscal+round(v_basket_fiscal_unit*v_line_qty,2);

      v_item_rows:=v_item_rows||jsonb_build_array(jsonb_build_object(
        'product_id',null,'sku',null,'name',v_basket.name,
        'quantity',v_line_qty,'unit_price',round(v_basket_unit,2),'line_total',round(v_basket_unit*v_line_qty,2),
        'metadata',jsonb_build_object(
          'source','vitrine_direct','history_kind','basket_mold','basket_id',v_basket.id,
          'mold_id',v_mold.id,'composition_number',v_composition_number,
          'hidden_value_fixed',v_mold.hidden_adjustment,
          'conditional_hidden_enabled',v_mold.conditional_hidden_enabled,
          'conditional_hidden_product_id',v_mold.conditional_hidden_product_id,
          'conditional_hidden_value',v_conditional_hidden_applied,
          'hidden_value_total',round(v_basket_unit-v_basket_fiscal_unit,2),
          'hidden_value_preserved',true,
          'component_snapshot',v_component_snapshot,'image_url',coalesce(v_basket.image_url,'')
        )
      ));
      v_sep_rows:=v_sep_rows||jsonb_build_array(jsonb_build_object(
        'basket_id',v_basket.id,'basket_name',v_basket.name,'quantity',v_line_qty,
        'mold',jsonb_build_object('mode','loose','mold_id',v_mold.id,'composition_number',v_composition_number,
          'hidden_value_fixed',v_mold.hidden_adjustment,
          'conditional_hidden_value',v_conditional_hidden_applied,
          'hidden_value_total',round(v_basket_unit-v_basket_fiscal_unit,2),
          'components',v_component_snapshot)
      ));
      continue;
    end if;

    begin
      select * into v_basket
      from public.basket_templates
      where id=(v_line->>'id')::uuid and is_active=true;
    exception when others then raise exception 'invalid_basket_id'; end;
    if not found then raise exception 'basket_unavailable'; end if;

    -- Compatibilidade transacional com lotes completos antigos. Eles permanecem
    -- vendáveis até esgotarem e podem coexistir no mesmo carrinho com lotes novos.
    begin v_legacy_lot_id:=nullif(v_line->>'lot_id','')::uuid;
    exception when others then v_legacy_lot_id:=null; end;
    if v_legacy_lot_id is not null then
      select * into v_legacy_lot
      from public.basket_stock_lots
      where id=v_legacy_lot_id
        and basket_id=v_basket.id
        and lot_kind='legacy_full'
      for update;
      if not found then raise exception 'basket_lot_unavailable'; end if;

      select public_available into v_existing_stock
      from public.basket_lot_public_availability_v1
      where lot_id=v_legacy_lot.id
        and availability_reason='available';
      if not found then raise exception 'basket_lot_unavailable'; end if;

      v_lot_requested:=coalesce((v_lot_demand->>v_legacy_lot.id::text)::integer,0)+v_line_qty::integer;
      if v_lot_requested>coalesce(v_existing_stock,0) then raise exception 'basket_lot_insufficient'; end if;
      v_lot_demand:=jsonb_set(v_lot_demand,array[v_legacy_lot.id::text],to_jsonb(v_lot_requested),true);

      if v_first_basket is null then v_first_basket:=v_basket.id; end if;
      if not (v_basket.name=any(v_basket_names)) then v_basket_names:=array_append(v_basket_names,v_basket.name); end if;
      v_basket_unit:=coalesce(v_legacy_lot.sale_price_override,v_basket.base_price,0);
      if v_basket_unit<0 then raise exception 'basket_price_invalid'; end if;
      v_basket_fiscal_unit:=0;
      v_supplied:=jsonb_typeof(v_line->'components')='array' and jsonb_array_length(v_line->'components')>0;

      for v_li in
        select
          li.id as lot_item_id,
          li.source_template_item_id,
          li.product_id as actual_product_id,
          li.quantity_per_basket,
          li.position_order,
          ti.product_id as template_product_id,
          ti.removable,
          ti.quantity_editable,
          ti.min_quantity,
          ti.max_quantity,
          ti.remove_unit_delta,
          ti.add_unit_delta
        from public.basket_stock_lot_items li
        left join public.basket_template_items ti on ti.id=li.source_template_item_id
        where li.lot_id=v_legacy_lot.id
        order by li.position_order,li.created_at,li.id
      loop
        select * into v_product from public.products where id=v_li.actual_product_id and is_active=true;
        if not found then raise exception 'basket_product_unavailable'; end if;

        v_base_qty:=v_li.quantity_per_basket;
        v_selected_qty:=v_base_qty;
        if v_supplied then
          v_selected:=null;
          select value into v_selected
          from jsonb_array_elements(v_line->'components')
          where value->>'product_id'=v_li.actual_product_id::text
          limit 1;
          if v_selected is null
             and v_li.template_product_id is not null
             and v_li.template_product_id<>v_li.actual_product_id then
            select value into v_selected
            from jsonb_array_elements(v_line->'components')
            where value->>'product_id'=v_li.template_product_id::text
            limit 1;
          end if;
          if v_selected is null then v_selected_qty:=0;
          else
            begin v_selected_qty:=coalesce(nullif(v_selected->>'quantity','')::numeric,0);
            exception when others then raise exception 'invalid_basket_quantity'; end;
          end if;
        end if;

        if v_selected_qty<0 or v_selected_qty>100 or trunc(v_selected_qty)<>v_selected_qty then
          raise exception 'invalid_basket_quantity';
        end if;
        if v_selected_qty=0 and not coalesce(v_li.removable,true) then raise exception 'item_not_removable'; end if;
        if v_selected_qty<v_base_qty and not (coalesce(v_li.removable,true) or coalesce(v_li.quantity_editable,true)) then
          raise exception 'quantity_not_editable';
        end if;
        if v_selected_qty>v_base_qty and not coalesce(v_li.quantity_editable,true) then raise exception 'quantity_not_editable'; end if;

        select case when stock_authority='bling' then loose_sellable_stock else coalesce(ean_sellable_stock,loose_sellable_stock,0) end into v_existing_stock
        from public.storefront_ean_sellable_stock_v1 where product_id=v_product.id;
        v_min:=greatest(0,coalesce(v_li.min_quantity,case when coalesce(v_li.removable,true) then 0 else v_base_qty end));
        v_max:=coalesce(v_li.max_quantity,v_base_qty+floor(coalesce(v_existing_stock,0)));
        if v_selected_qty<v_min or v_selected_qty>v_max then raise exception 'basket_quantity_out_of_range'; end if;

        v_delta:=0;
        if v_selected_qty<v_base_qty then
          v_delta:=abs(v_selected_qty-v_base_qty)*coalesce(v_li.remove_unit_delta,-coalesce(v_product.price,0));
        elsif v_selected_qty>v_base_qty then
          v_delta:=(v_selected_qty-v_base_qty)*coalesce(v_li.add_unit_delta,coalesce(v_product.price,0));
        end if;
        v_basket_unit:=v_basket_unit+v_delta;

        if v_selected_qty>0 then
          v_unit:=coalesce(v_product.price,0);
          v_line_total:=round(v_unit*v_selected_qty*v_line_qty,2);
          v_basket_fiscal_unit:=v_basket_fiscal_unit+round(v_unit*v_selected_qty,2);
          v_preassembled_units:=least(v_selected_qty,v_base_qty)*v_line_qty;
          v_loose_units:=greatest(v_selected_qty-v_base_qty,0)*v_line_qty;
          if v_loose_units>0 then
            v_current_demand:=coalesce((v_loose_demand->>v_product.id::text)::numeric,0)+v_loose_units;
            v_loose_demand:=jsonb_set(v_loose_demand,array[v_product.id::text],to_jsonb(v_current_demand),true);
          end if;
          v_item_rows:=v_item_rows||jsonb_build_array(jsonb_build_object(
            'product_id',v_product.id,'sku',v_product.sku,'name',v_product.name,
            'quantity',v_selected_qty*v_line_qty,'unit_price',v_unit,'line_total',v_line_total,
            'metadata',jsonb_build_object(
              'source','vitrine_direct','history_kind','basket_component',
              'basket_id',v_basket.id,'basket_name',v_basket.name,'basket_quantity',v_line_qty,
              'basket_lot_id',v_legacy_lot.id,'basket_lot_code',v_legacy_lot.lot_code,
              'base_quantity',v_base_qty,'selected_quantity',v_selected_qty,
              'preassembled_units',v_preassembled_units,'loose_extra_quantity',v_loose_units,
              'commercial_delta_per_basket',v_delta,'image_url',coalesce(v_product.image_url,''),
              'template_product_id',v_li.template_product_id
            )
          ));
        end if;
      end loop;

      if v_supplied and exists(
        select 1 from jsonb_array_elements(v_line->'components') c
        where coalesce(c->>'product_id','')<>''
          and not exists(
            select 1
            from public.basket_stock_lot_items li
            left join public.basket_template_items ti on ti.id=li.source_template_item_id
            where li.lot_id=v_legacy_lot.id
              and (li.product_id::text=c->>'product_id' or ti.product_id::text=c->>'product_id')
          )
      ) then raise exception 'basket_component_not_in_lot'; end if;

      select coalesce(jsonb_agg(jsonb_build_object(
        'product_id',li.product_id,'quantity_per_basket',li.quantity_per_basket,
        'source_template_item_id',li.source_template_item_id
      ) order by li.position_order,li.created_at),'[]'::jsonb)
      into v_component_snapshot
      from public.basket_stock_lot_items li where li.lot_id=v_legacy_lot.id;

      v_alloc_rows:=v_alloc_rows||jsonb_build_array(jsonb_build_object(
        'basket_id',v_basket.id,'lot_id',v_legacy_lot.id,'quantity',v_line_qty,
        'component_snapshot',v_component_snapshot,'allocation_role','legacy_full','short_code',null
      ));
      v_sep_rows:=v_sep_rows||jsonb_build_array(jsonb_build_object(
        'basket_id',v_basket.id,'basket_name',coalesce(v_legacy_lot.public_name,v_basket.name),'quantity',v_line_qty,
        'legacy',jsonb_build_object('mode','lot','lot_id',v_legacy_lot.id,'lot_code',v_legacy_lot.lot_code)
      ));
      if v_basket_unit<0 then raise exception 'invalid_order_total'; end if;
      v_total:=v_total+round(v_basket_unit*v_line_qty,2);
      v_fiscal:=v_fiscal+round(v_basket_fiscal_unit*v_line_qty,2);
      continue;
    end if;

    if v_first_basket is null then v_first_basket:=v_basket.id; end if;
    if not (v_basket.name=any(v_basket_names)) then v_basket_names:=array_append(v_basket_names,v_basket.name); end if;

    v_components:=coalesce(v_line->'components','[]'::jsonb);
    if jsonb_typeof(v_components)<>'array' or jsonb_array_length(v_components)=0 then
      raise exception 'basket_components_required';
    end if;

    begin v_food_lot_id:=nullif(v_line->>'food_lot_id','')::uuid;
    exception when others then v_food_lot_id:=null; end;
    begin v_hygiene_lot_id:=nullif(v_line->>'hygiene_lot_id','')::uuid;
    exception when others then v_hygiene_lot_id:=null; end;
    if v_food_lot_id is null then raise exception 'basket_food_lot_required'; end if;

    if not exists(
      select 1
      from public.basket_stock_lots l
      join public.basket_kit_templates k on k.id=l.kit_template_id
      where l.id=v_food_lot_id and k.kind='food' and k.basket_id=v_basket.id
    ) then raise exception 'basket_food_lot_invalid'; end if;

    v_basket.uses_hygiene_kit:=exists(
      select 1
      from public.basket_stock_lots fl
      where fl.id=v_food_lot_id and coalesce(fl.linked_lot_id,fl.linked_hygiene_lot_id) is not null
    );
    if v_basket.uses_hygiene_kit then
      select coalesce(fl.linked_lot_id,fl.linked_hygiene_lot_id) into v_hygiene_lot_id
      from public.basket_stock_lots fl
      where fl.id=v_food_lot_id;
    else
      v_hygiene_lot_id:=null;
    end if;

    if v_basket.uses_hygiene_kit and not exists(
      select 1
      from public.basket_stock_lots l
      join public.basket_kit_templates k on k.id=l.kit_template_id
      where l.id=v_hygiene_lot_id
        and l.status='ready' and l.quantity_available>0
    ) then raise exception 'basket_hygiene_lot_invalid'; end if;

    v_food_changed:=not public.basket_group_preserves_original_lot_v1(v_components,'food',v_food_lot_id);
    v_hygiene_changed:=case when v_basket.uses_hygiene_kit
      then not public.basket_group_preserves_original_lot_v1(v_components,'hygiene',v_hygiene_lot_id)
      else false end;
    if v_food_changed or v_hygiene_changed then
      v_food_changed:=true;
      if v_basket.uses_hygiene_kit then v_hygiene_changed:=true; end if;
    end if;

    v_basket_unit:=public.basket_lot_commercial_price_v1(v_basket.id,v_food_lot_id);
    v_basket_fiscal_unit:=0;
    v_food_short:=null;
    v_hygiene_short:=null;

    foreach v_group in array array['food','hygiene'] loop
      if v_group='hygiene' and not v_basket.uses_hygiene_kit then continue; end if;
      v_group_lot_id:=case when v_group='food' then v_food_lot_id else v_hygiene_lot_id end;
      v_group_changed:=case when v_group='food' then v_food_changed else v_hygiene_changed end;
      v_group_kind:=v_group;

      select short_code into v_group_short
      from public.basket_stock_lots where id=v_group_lot_id;
      if v_group='food' then v_food_short:=v_group_short; else v_hygiene_short:=v_group_short; end if;

      if not v_group_changed then
        -- Lock first, then read the canonical view. A concurrent checkout cannot
        -- reuse the same last unit after the first transaction updates the lot.
        perform 1
        from public.basket_stock_lots
        where id=v_group_lot_id
        for update;
        if not found then raise exception 'basket_kit_lot_unavailable'; end if;

        v_lot_requested:=coalesce((v_lot_demand->>v_group_lot_id::text)::integer,0)+v_line_qty::integer;
        select public_available into v_existing_stock
        from public.basket_lot_public_availability_v1
        where lot_id=v_group_lot_id
          and availability_reason='available';
        if not found then raise exception 'basket_kit_lot_unavailable'; end if;
        if v_lot_requested>coalesce(v_existing_stock,0) then raise exception 'basket_kit_lot_insufficient'; end if;
        v_lot_demand:=jsonb_set(v_lot_demand,array[v_group_lot_id::text],to_jsonb(v_lot_requested),true);

        select coalesce(jsonb_agg(jsonb_build_object(
          'product_id',li.product_id,'quantity_per_kit',li.quantity_per_basket,
          'kit_template_item_id',li.kit_template_item_id
        ) order by li.position_order,li.created_at),'[]'::jsonb)
        into v_component_snapshot
        from public.basket_stock_lot_items li
        where li.lot_id=v_group_lot_id;

        v_alloc_rows:=v_alloc_rows||jsonb_build_array(jsonb_build_object(
          'basket_id',v_basket.id,'lot_id',v_group_lot_id,'quantity',v_line_qty,
          'allocation_role',v_group_kind,'short_code',v_group_short,
          'component_snapshot',v_component_snapshot
        ));
      end if;

      if exists(
        select 1
        from jsonb_array_elements(v_components) c
        where coalesce(c->>'component_group','')=v_group
          and coalesce(c->>'product_id','')<>''
          and not exists(
            select 1 from public.basket_stock_lot_items li
            where li.lot_id=v_group_lot_id and li.product_id::text=c->>'product_id'
          )
      ) then raise exception 'basket_component_not_in_selected_kit'; end if;

      for v_li in
        select
          li.product_id,
          li.quantity_per_basket,
          li.position_order,
          li.kit_template_item_id,
          ki.removable,ki.quantity_editable,ki.min_quantity,ki.max_quantity,
          ki.remove_unit_delta,ki.add_unit_delta
        from public.basket_stock_lot_items li
        left join public.basket_kit_template_items ki on ki.id=li.kit_template_item_id
        where li.lot_id=v_group_lot_id
        order by li.position_order,li.created_at,li.id
      loop
        select * into v_product from public.products where id=v_li.product_id and is_active=true;
        if not found then raise exception 'basket_product_unavailable'; end if;

        v_base_qty:=v_li.quantity_per_basket;
        select coalesce(sum(nullif(c.value->>'quantity','')::numeric),0)
        into v_selected_qty
        from jsonb_array_elements(v_components) c(value)
        where coalesce(c.value->>'component_group','')=v_group
          and c.value->>'product_id'=v_li.product_id::text;

        if v_selected_qty<0 or v_selected_qty>100 or trunc(v_selected_qty)<>v_selected_qty then
          raise exception 'invalid_basket_quantity';
        end if;

        if v_selected_qty=0 and coalesce(v_li.removable,true)=false then raise exception 'item_not_removable'; end if;
        if v_selected_qty<v_base_qty
           and not (coalesce(v_li.removable,true) or coalesce(v_li.quantity_editable,true)) then
          raise exception 'quantity_not_editable';
        end if;
        if v_selected_qty>v_base_qty and coalesce(v_li.quantity_editable,true)=false then
          raise exception 'quantity_not_editable';
        end if;

        select case when stock_authority='bling' then loose_sellable_stock else coalesce(ean_sellable_stock,loose_sellable_stock,0) end into v_existing_stock
        from public.storefront_ean_sellable_stock_v1
        where product_id=v_product.id;
        v_min:=greatest(0,coalesce(v_li.min_quantity,case when coalesce(v_li.removable,true) then 0 else v_base_qty end));
        v_max:=coalesce(v_li.max_quantity,
          case when v_group_changed then floor(coalesce(v_existing_stock,0)) else v_base_qty+floor(coalesce(v_existing_stock,0)) end);
        if v_selected_qty<v_min or v_selected_qty>v_max then raise exception 'basket_quantity_out_of_range'; end if;

        v_delta:=0;
        if v_selected_qty<v_base_qty then
          v_delta:=abs(v_selected_qty-v_base_qty)*coalesce(v_li.remove_unit_delta,-coalesce(v_product.price,0));
        elsif v_selected_qty>v_base_qty then
          v_delta:=(v_selected_qty-v_base_qty)*coalesce(v_li.add_unit_delta,coalesce(v_product.price,0));
        end if;
        v_basket_unit:=v_basket_unit+v_delta;

        if v_selected_qty>0 then
          v_unit:=coalesce(v_product.price,0);
          v_line_total:=round(v_unit*v_selected_qty*v_line_qty,2);
          v_basket_fiscal_unit:=v_basket_fiscal_unit+round(v_unit*v_selected_qty,2);
          v_preassembled_units:=case when v_group_changed then 0 else v_base_qty*v_line_qty end;
          v_loose_units:=case when v_group_changed then v_selected_qty*v_line_qty else greatest(v_selected_qty-v_base_qty,0)*v_line_qty end;

          if v_loose_units>0 then
            v_current_demand:=coalesce((v_loose_demand->>v_product.id::text)::numeric,0)+v_loose_units;
            v_loose_demand:=jsonb_set(v_loose_demand,array[v_product.id::text],to_jsonb(v_current_demand),true);
          end if;

          v_item_rows:=v_item_rows||jsonb_build_array(jsonb_build_object(
            'product_id',v_product.id,'sku',v_product.sku,'name',v_product.name,
            'quantity',v_selected_qty*v_line_qty,'unit_price',v_unit,'line_total',v_line_total,
            'metadata',jsonb_build_object(
              'source','vitrine_direct','history_kind','basket_component',
              'parent_basket_name',v_basket.name,'basket_id',v_basket.id,
              'basket_name',v_basket.name,'basket_quantity',v_line_qty,
              'component_group',v_group,'group_mode',case when v_group_changed then 'loose' else 'lot' end,
              'kit_lot_id',v_group_lot_id,'kit_lot_short_code',case when v_group_changed then null else v_group_short end,
              'base_quantity',v_base_qty,'selected_quantity',v_selected_qty,
              'preassembled_units',v_preassembled_units,'loose_quantity',v_loose_units,
              'commercial_delta_per_basket',v_delta,'image_url',coalesce(v_product.image_url,'')
            )
          ));
        end if;
      end loop;
    end loop;

    if v_basket_unit<0 then raise exception 'invalid_order_total'; end if;
    v_total:=v_total+round(v_basket_unit*v_line_qty,2);
    v_fiscal:=v_fiscal+round(v_basket_fiscal_unit*v_line_qty,2);

    v_item_rows:=v_item_rows||jsonb_build_array(jsonb_build_object(
      'product_id',null,'sku',null,'name',v_basket.name,
      'quantity',v_line_qty,'unit_price',round(v_basket_unit,2),'line_total',round(v_basket_unit*v_line_qty,2),
      'metadata',jsonb_build_object(
        'source','vitrine_direct','history_kind','basket','basket_id',v_basket.id,
        'image_url',coalesce(v_basket.image_url,''),
        'food_mode',case when v_food_changed then 'loose' else 'lot' end,
        'food_lot_id',v_food_lot_id,
        'food_lot_short_code',case when v_food_changed then null else v_food_short end,
        'hygiene_required',v_basket.uses_hygiene_kit,
        'hygiene_mode',case when not v_basket.uses_hygiene_kit then 'none' when v_hygiene_changed then 'loose' else 'lot' end,
        'hygiene_lot_id',case when v_basket.uses_hygiene_kit then v_hygiene_lot_id else null end,
        'hygiene_lot_short_code',case when v_basket.uses_hygiene_kit and not v_hygiene_changed then v_hygiene_short else null end,
        'commercial_base_price',public.basket_lot_commercial_price_v1(v_basket.id,v_food_lot_id),
        'hidden_value_preserved',true
      )
    ));

    v_sep_rows:=v_sep_rows||jsonb_build_array(jsonb_build_object(
      'basket_id',v_basket.id,'basket_name',coalesce((select public_name from public.basket_stock_lots where id=v_food_lot_id),v_basket.name),'quantity',v_line_qty,
      'food',jsonb_build_object(
        'mode',case when v_food_changed then 'loose' else 'lot' end,
        'lot_id',case when v_food_changed then null else v_food_lot_id end,
        'short_code',case when v_food_changed then null else v_food_short end
      ),
      'hygiene',case when not v_basket.uses_hygiene_kit then jsonb_build_object('mode','none')
        else jsonb_build_object(
          'mode',case when v_hygiene_changed then 'loose' else 'lot' end,
          'lot_id',case when v_hygiene_changed then null else v_hygiene_lot_id end,
          'short_code',case when v_hygiene_changed then null else v_hygiene_short end
        ) end
    ));
  end loop;

  if v_total<75 and coalesce((v_customer->>'stock_adjusted_retry')::boolean,false)=false then raise exception 'minimum_order'; end if;

  for v_pair in select key,value from jsonb_each_text(v_loose_demand) loop
    perform 1 from public.products where id=v_pair.key::uuid for update;
    if not found then raise exception 'product_unavailable'; end if;

    select coalesce(sum(nullif(item->>'quantity','')::numeric),0)
    into v_mold_component_demand
    from jsonb_array_elements(v_item_rows) as item
    where item->>'product_id'=v_pair.key
      and item#>>'{metadata,history_kind}'='basket_mold_component';

    if coalesce((select p.is_active from public.products p where p.id=v_pair.key::uuid),false) then
      select case when stock_authority='bling' then loose_sellable_stock else coalesce(ean_sellable_stock,loose_sellable_stock) end into v_existing_stock
      from public.storefront_ean_sellable_stock_v1
      where product_id=v_pair.key::uuid and is_active=true;
      if not found then raise exception 'product_unavailable'; end if;
    else
      if v_mold_component_demand<>v_pair.value::numeric then
        raise exception 'product_unavailable';
      end if;
      select public.basket_component_fresh_sellable_stock_v1(v_pair.key::uuid)
      into v_existing_stock;
    end if;

    if coalesce(v_existing_stock,0)<v_pair.value::numeric then
      if v_mold_component_demand=v_pair.value::numeric then
        select coalesce(jsonb_agg(
          case when item->>'product_id'=v_pair.key
            then jsonb_set(item,'{metadata}',
              coalesce(item->'metadata','{}'::jsonb)||jsonb_build_object(
                'manual_replacement_required',true,
                'manual_replacement_reason','aggregate_stock_shortage'
              ),true)
            else item end
          order by ordinal
        ),'[]'::jsonb)
        into v_item_rows
        from jsonb_array_elements(v_item_rows) with ordinality rows(item,ordinal);
      else
        raise exception 'insufficient_stock';
      end if;
    end if;
  end loop;

  v_order_number:='DA-'||to_char(clock_timestamp() at time zone 'America/Cuiaba','YYMMDD')||'-'||upper(substr(replace(v_order_id::text,'-',''),1,8));
  v_addr:=jsonb_strip_nulls(jsonb_build_object(
    'customer_name',nullif(v_customer->>'display_name',''),'source_customer_id',v_customer_id,
    'phone',v_phone,'street',nullif(v_customer#>>'{address,street}',''),
    'number',nullif(v_customer#>>'{address,number}',''),'complement',nullif(v_customer#>>'{address,complement}',''),
    'district',coalesce(nullif(v_customer#>>'{address,district}',''),nullif(v_customer#>>'{address,neighborhood}','')),
    'city',nullif(v_customer#>>'{address,city}',''),'state',nullif(v_customer#>>'{address,state}',''),
    'postal_code',nullif(v_customer#>>'{address,postal_code}',''),'raw_text',nullif(v_customer#>>'{address,raw_text}',''),
    'google_maps_url',nullif(v_customer#>>'{address,google_maps_url}',''),
    'delivery_date',nullif(v_delivery->>'date',''),'delivery_label',nullif(v_delivery->>'label',''),
    'delivery_reason',nullif(v_delivery->>'reason',''),'delivery_time_zone',nullif(v_delivery->>'time_zone',''),
    'delivery_cutoff_hour',v_delivery->'cutoff_hour'
  ));

  insert into public.orders(
    id,customer_id,status,total,currency,delivery_address,customer_snapshot,confirmed_at,
    created_at,updated_at,basket_id,fiscal_subtotal,other_expenses,discount,sync_status,
    idempotency_key,payment_method,phone_e164,source,subtotal,order_number,basket_name_snapshot,
    checkout_snapshot
  ) values(
    v_order_id,v_customer_id,'storefront_received',round(v_total,2),'BRL',coalesce(v_addr,'{}'::jsonb),
    jsonb_strip_nulls(jsonb_build_object(
      'customer_id',v_customer_id,'name',nullif(v_customer->>'display_name',''),
      'phone_e164',v_phone,'status',case when v_customer_id is null then 'new' else 'registered' end
    )),
    null,now(),now(),
    case when array_length(v_basket_names,1)=1 then v_first_basket else null end,
    round(v_fiscal,2),greatest(round(v_total-v_fiscal,2),0),greatest(round(v_fiscal-v_total,2),0),
    'local','vitrine-direct-v3:'||v_order_id::text,v_payment_code,v_phone,'vitrine',
    round(v_total,2),v_order_number,
    case when array_length(v_basket_names,1)=1 then v_basket_names[1] else null end,
    jsonb_build_object(
      'source','vitrine_direct','cart',v_cart,'payment_label',v_payment_label,
      'delivery',v_delivery,'customer',v_customer,'basket_names',to_jsonb(v_basket_names),
      'split_kits',true,'separation_plan',v_sep_rows,'hidden_value_preserved',true
    )
  );

  for v_line in select value from jsonb_array_elements(v_item_rows) loop
    insert into public.order_items(order_id,product_id,sku_snapshot,name_snapshot,quantity,unit_price,line_total,metadata)
    values(
      v_order_id,
      case when nullif(v_line->>'product_id','') is null then null else (v_line->>'product_id')::uuid end,
      nullif(v_line->>'sku',''),v_line->>'name',
      (v_line->>'quantity')::numeric,(v_line->>'unit_price')::numeric,(v_line->>'line_total')::numeric,
      coalesce(v_line->'metadata','{}'::jsonb)
    );
  end loop;

  for v_line in select value from jsonb_array_elements(v_alloc_rows) loop
    update public.basket_stock_lots
    set quantity_available=quantity_available-(v_line->>'quantity')::integer,
        status=case when quantity_available-(v_line->>'quantity')::integer=0 then 'depleted' else 'ready' end,
        updated_at=now()
    where id=(v_line->>'lot_id')::uuid
      and status='ready'
      and quantity_available>=(v_line->>'quantity')::integer;
    if not found then raise exception 'basket_kit_lot_insufficient'; end if;

    insert into public.basket_stock_allocations(
      order_id,basket_id,lot_id,quantity,status,component_snapshot,allocation_role,metadata
    ) values(
      v_order_id,(v_line->>'basket_id')::uuid,(v_line->>'lot_id')::uuid,
      (v_line->>'quantity')::integer,'allocated',
      coalesce(v_line->'component_snapshot','[]'::jsonb),
      v_line->>'allocation_role',
      jsonb_build_object(
        'source','order_create_v3','preassembled',true,
        'short_code',v_line->>'short_code','allocation_role',v_line->>'allocation_role'
      )
    )
    on conflict(order_id,lot_id,basket_id,allocation_role) do update
      set quantity=public.basket_stock_allocations.quantity+excluded.quantity,
          component_snapshot=excluded.component_snapshot,
          metadata=excluded.metadata;
  end loop;

  return jsonb_build_object(
    'order_id',v_order_id,'order_number',v_order_number,
    'total_cents',round(v_total*100)::bigint,'total',round(v_total,2),
    'customer_id',v_customer_id,'phone_e164',v_phone,'payment_method',v_payment_label,
    'split_kits',true,'separation_plan',v_sep_rows,'hidden_value_preserved',true
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.reserve_vitrine_order_stock_v1(p_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  r record;
  v_authority text;
  v_effective numeric;
  v_pending_local numeric;
  v_available numeric;
  v_demand_count integer:=0;
  v_manual_replacement_count integer:=0;
  v_manual_shortage_products uuid[]:='{}'::uuid[];
begin
  select coalesce(metadata->>'ops2_stock_authority','legacy_shadow')
    into v_authority
  from public.bling_hub_runtime_v2 where id=1;

  if p_order_id is null or not exists(
    select 1 from public.orders
    where id=p_order_id and source in ('vitrine','manual_whatsapp','papoai','reorder')
  ) then return jsonb_build_object('ok',false,'error','order_not_found'); end if;

  if exists(select 1 from public.vitrine_stock_reservations where order_id=p_order_id and status='consumed') then
    return jsonb_build_object('ok',true,'status','already_consumed','stock_authority',v_authority);
  end if;

  for r in
    select oi.product_id,
      sum(case
        when coalesce(oi.metadata->>'history_kind','')='basket_component'
          then greatest(oi.quantity-coalesce(nullif(oi.metadata->>'preassembled_units','')::numeric,0),0)
        else oi.quantity
      end) as quantity,
      bool_and(coalesce(oi.metadata->>'history_kind','')='basket_mold_component') as basket_components_only
    from public.order_items oi
    where oi.order_id=p_order_id and oi.product_id is not null
    group by oi.product_id
    having sum(case
      when coalesce(oi.metadata->>'history_kind','')='basket_component'
        then greatest(oi.quantity-coalesce(nullif(oi.metadata->>'preassembled_units','')::numeric,0),0)
      else oi.quantity
    end)>0
    order by oi.product_id
  loop
    v_demand_count:=v_demand_count+1;
    perform 1 from public.products p
    where p.id=r.product_id and (
      p.is_active=true or exists(
        select 1 from public.order_items oi
        join public.basket_mold_positions pos on pos.id::text=oi.metadata->>'position_id'
        join public.basket_molds bm on bm.id=pos.mold_id
          and bm.id::text=oi.metadata->>'mold_id'
          and bm.basket_id::text=oi.metadata->>'basket_id'
        join public.basket_mold_position_options opt on opt.position_id=pos.id and opt.product_id=p.id
        where oi.order_id=p_order_id and oi.product_id=p.id
          and oi.metadata->>'history_kind'='basket_mold_component'
      )
    ) for update;
    if not found then return jsonb_build_object('ok',false,'error','product_unavailable','product_id',r.product_id); end if;


    select case when v_authority='bling' then null::numeric else ean_sellable_stock end into v_effective
    from public.storefront_ean_sellable_stock_v1
    where product_id=r.product_id;
    if v_effective is not null then
      v_available:=greatest(0,v_effective);
    elsif v_authority='bling' then
      select public.basket_component_fresh_sellable_stock_v1(r.product_id) into v_effective;
      if v_effective is null then return jsonb_build_object('ok',false,'error','bling_stock_unavailable','product_id',r.product_id); end if;

      select coalesce(sum(x.quantity),0) into v_pending_local
      from public.vitrine_stock_reservations x
      join public.orders o on o.id=x.order_id
      where x.product_id=r.product_id and x.status='reserved' and x.expires_at>now()
        and x.order_id<>p_order_id and (o.bling_synced_at is null or o.sync_status<>'sent_to_bling');
      v_available:=greatest(0,coalesce(v_effective,0)-coalesce(v_pending_local,0));
    else
      select public.basket_component_fresh_sellable_stock_v1(r.product_id) into v_effective;
      select coalesce(sum(x.quantity),0) into v_pending_local
      from public.vitrine_stock_reservations x
      where x.product_id=r.product_id and x.status='reserved' and x.expires_at>now() and x.order_id<>p_order_id;
      v_available:=greatest(0,coalesce(v_effective,0)-coalesce(v_pending_local,0));
    end if;

    if v_available<r.quantity then
      if r.basket_components_only then
        update public.order_items
        set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
          'manual_replacement_required',true,
          'manual_replacement_reason','stock_shortage_at_reservation'
        )
        where order_id=p_order_id and product_id=r.product_id
          and metadata->>'history_kind'='basket_mold_component';
        v_manual_replacement_count:=v_manual_replacement_count+1;
        v_manual_shortage_products:=array_append(v_manual_shortage_products,r.product_id);
        continue;
      end if;
      return jsonb_build_object('ok',false,'error','insufficient_stock','product_id',r.product_id,
        'available',v_available,'requested',r.quantity,'stock_authority',v_authority);
    end if;
  end loop;

  if v_demand_count=0 then
    return jsonb_build_object('ok',true,
      'status',case when v_manual_replacement_count>0 then 'manual_replacement_pending' else 'preassembled_only' end,
      'manual_replacement_count',v_manual_replacement_count,'stock_authority',v_authority,
      'local_reservation_tracking',true,'physical_stock_changed',false);
  end if;

  insert into public.vitrine_stock_reservations(order_id,product_id,quantity,status,expires_at,updated_at)
  select p_order_id,oi.product_id,
    sum(case
      when coalesce(oi.metadata->>'history_kind','')='basket_component'
        then greatest(oi.quantity-coalesce(nullif(oi.metadata->>'preassembled_units','')::numeric,0),0)
      else oi.quantity
    end),
    'reserved',now()+interval '48 hours',now()
  from public.order_items oi
  where oi.order_id=p_order_id and oi.product_id is not null
    and not (oi.product_id=any(v_manual_shortage_products))
  group by oi.product_id
  having sum(case
    when coalesce(oi.metadata->>'history_kind','')='basket_component'
      then greatest(oi.quantity-coalesce(nullif(oi.metadata->>'preassembled_units','')::numeric,0),0)
    else oi.quantity
  end)>0
  on conflict(order_id,product_id) do update
    set quantity=excluded.quantity,status='reserved',expires_at=excluded.expires_at,
        updated_at=now(),consumed_at=null,released_at=null;

  return jsonb_build_object('ok',true,
    'status',case
      when v_manual_replacement_count>0 and v_demand_count<=v_manual_replacement_count then 'manual_replacement_pending'
      when v_manual_replacement_count>0 then 'reserved_with_manual_replacements'
      else 'reserved'
    end,
    'manual_replacement_count',v_manual_replacement_count,'stock_authority',v_authority,
    'local_reservation_tracking',true,'physical_stock_changed',false);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.create_vitrine_cart_order_v3(p_phone text, p_payment_method text, p_items jsonb, p_customer_snapshot jsonb DEFAULT '{}'::jsonb, p_delivery jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_result jsonb;
  v_order_id uuid;
  v_reservation jsonb;
  v_error text;
begin
  v_result:=public.create_vitrine_cart_order_v3_base(
    p_phone,p_payment_method,p_items,p_customer_snapshot,p_delivery
  );

  begin
    v_order_id:=nullif(v_result->>'order_id','')::uuid;
  exception when others then
    v_order_id:=null;
  end;
  if v_order_id is null then
    raise exception 'order_id_missing' using errcode='P0001';
  end if;

  v_reservation:=public.reserve_vitrine_order_stock_v1(v_order_id);
  if coalesce((v_reservation->>'ok')::boolean,false) is not true then
    v_error:=coalesce(nullif(v_reservation->>'error',''),'stock_reservation_failed');
    raise exception '%',v_error using errcode='P0001';
  end if;

  v_result:=v_result||jsonb_build_object(
    'stock_reserved',coalesce(v_reservation->>'status','reserved')<>'manual_replacement_pending',
    'reservation_timing','on_create',
    'reservation_status',coalesce(v_reservation->>'status','reserved'),
    'manual_replacement_count',coalesce(nullif(v_reservation->>'manual_replacement_count','')::integer,0)
  );

  return public.ops2_enrich_storefront_order_result_v1(v_result);
end;
$function$
;
