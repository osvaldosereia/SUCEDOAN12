-- Add editable type subtitles to the shared Cestas Completas catalog and
-- make them available in public compositions.
update public.basket_mold_shared_items
set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
  'subtitle',
  case
    when lower(label) like '%arroz%' then 'ARROZ'
    when lower(label) like '%feijão%' then 'FEIJÃO'
    when lower(label) like '%óleo%' then 'ÓLEO'
  end
)
where scope='cestas-completas'
  and coalesce(nullif(btrim(metadata->>'subtitle'),''),'')=''
  and (lower(label) like '%arroz%' or lower(label) like '%feijão%' or lower(label) like '%óleo%');

CREATE OR REPLACE FUNCTION public.admin_basket_mold_shared_items_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_uid uuid:=auth.uid();
begin
  if v_uid is null or not exists(
    select 1 from public.admin_users a where a.user_id=v_uid and a.is_active and a.role<>'viewer'
  ) then raise exception 'admin_not_authorized'; end if;
  return jsonb_build_object('items',coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',i.id,'label',i.label,'subtitle',coalesce(i.metadata->>'subtitle',''),'sort_order',i.sort_order,
      'options',coalesce((
        select jsonb_agg(jsonb_build_object(
          'product_id',p.id,'name',p.name,'brand',p.brand,'sku',p.sku,'gtin',p.gtin,
          'image_url',p.image_url,'price',p.price,'offer_price',p.offer_price,'is_offer',p.is_offer,
          'sort_order',o.sort_order
        ) order by o.sort_order,o.id)
        from public.basket_mold_shared_item_options o
        join public.products p on p.id=o.product_id
        where o.shared_item_id=i.id
      ),'[]'::jsonb)
    ) order by i.sort_order,i.label)
    from public.basket_mold_shared_items i where i.scope='cestas-completas'
  ),'[]'::jsonb));
end;
$function$


CREATE OR REPLACE FUNCTION public.admin_upsert_basket_mold_shared_item_v2(p_item jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid:=auth.uid();
  v_id uuid;
  v_label text;
  v_subtitle text;
  v_old_label text;
  v_options jsonb;
  v_option jsonb;
  v_product uuid;
  v_seen uuid[]:='{}'::uuid[];
  v_order integer:=0;
  v_limit integer:=40;
begin
  if v_uid is null or not exists(
    select 1 from public.admin_users a
    where a.user_id=v_uid and a.is_active and a.role<>'viewer'
  ) then raise exception 'admin_not_authorized'; end if;
  if p_item is null or jsonb_typeof(p_item)<>'object' then
    raise exception 'basket_mold_shared_item_invalid';
  end if;
  v_label:=btrim(coalesce(p_item->>'label',''));
  v_subtitle:=upper(btrim(coalesce(p_item->>'subtitle','')));
  v_options:=p_item->'options';
  if v_label='' or char_length(v_label)>180 or char_length(v_subtitle)>80
     or coalesce(jsonb_typeof(v_options),'')<>'array'
     or jsonb_array_length(v_options) < 1 or jsonb_array_length(v_options)>v_limit then
    raise exception 'basket_mold_shared_item_invalid';
  end if;
  -- Prevent overlapping mutations on the shared registry.
  perform pg_advisory_xact_lock(hashtextextended('basket_mold_shared_items:cestas-completas',0));
  v_id:=nullif(p_item->>'id','')::uuid;
  if v_id is null then
    insert into public.basket_mold_shared_items(scope,label,sort_order,metadata)
    values ('cestas-completas',v_label,
      (select coalesce(max(sort_order)+1,0) from public.basket_mold_shared_items where scope='cestas-completas'),
      jsonb_build_object('updated_by',v_uid,'subtitle',v_subtitle))
    returning id into v_id;
  else
    select label into v_old_label from public.basket_mold_shared_items
    where id=v_id and scope='cestas-completas' for update;
    if not found then raise exception 'basket_mold_shared_item_not_found'; end if;
    if v_label<>v_old_label then
      -- Allow a rename while preserving existing quantities in each basket.
      update public.basket_mold_positions pos set label=v_label
      from public.basket_molds m,public.basket_templates b,public.basket_categories cat
      where pos.mold_id=m.id and m.basket_id=b.id and b.category_id=cat.id
        and cat.slug='cestas-completas' and pos.label=v_old_label;
    end if;
    update public.basket_mold_shared_items set label=v_label,
       updated_at=now(),metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('updated_by',v_uid,'subtitle',v_subtitle)
    where id=v_id;
  end if;
  for v_option in select value from jsonb_array_elements(v_options) loop
    v_product:=nullif(v_option->>'product_id','')::uuid;
    if v_product is null or v_product=any(v_seen)
      or not exists(select 1 from public.products p where p.id=v_product and p.is_active=true) then
      raise exception 'basket_mold_shared_product_invalid';
    end if;
    v_seen:=array_append(v_seen,v_product);
  end loop;

  delete from public.basket_mold_shared_item_options where shared_item_id=v_id;
  for v_option in select value from jsonb_array_elements(v_options) loop
    insert into public.basket_mold_shared_item_options(shared_item_id,product_id,sort_order)
    values (v_id,(v_option->>'product_id')::uuid,v_order);
    v_order:=v_order+1;
  end loop;

  -- Materialize the shared choices into each active position, without touching quantities.
  delete from public.basket_mold_position_options op
    using public.basket_mold_positions pos,public.basket_molds m,
          public.basket_templates b,public.basket_categories cat
    where op.position_id=pos.id and pos.mold_id=m.id and m.basket_id=b.id
      and b.category_id=cat.id and cat.slug='cestas-completas' and pos.label=v_label;
  insert into public.basket_mold_position_options(position_id,product_id,sort_order)
    select pos.id,op.product_id,op.sort_order
    from public.basket_mold_positions pos
    join public.basket_molds m on m.id=pos.mold_id
    join public.basket_templates b on b.id=m.basket_id
    join public.basket_categories cat on cat.id=b.category_id and cat.slug='cestas-completas'
    join public.basket_mold_shared_item_options op on op.shared_item_id=v_id
    where pos.label=v_label;
  return public.admin_basket_mold_shared_items_v1() || jsonb_build_object('item_id',v_id);
end;
$function$


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
), eligible as (
  select pos.id as position_id, pos.mold_id, m.basket_id, pos.label,
         coalesce((select nullif(btrim(si.metadata->>'subtitle'),'') from public.basket_mold_shared_items si where si.scope='cestas-completas' and si.label=pos.label limit 1),'') as subtitle,
         pos.quantity,
         pos.sort_order as position_order, opt.product_id, opt.sort_order as option_order,
         (coalesce(opt.metadata, '{}'::jsonb) @> '{"preferred":true}'::jsonb) as is_preferred,
         p.name as product_name, p.sku, p.gtin, p.image_url, m.is_complete,
         case when p.is_offer=true and p.offer_price>0 then p.offer_price
              when p.price>0 then p.price else 9999999 end as unit_price,
         greatest(0, coalesce(s.loose_sellable_stock, 0)
           - coalesce(orr.reserved, 0))::numeric as available_stock
  from mold m
  join public.basket_mold_positions pos on pos.mold_id = m.id
  join public.basket_mold_position_options opt on opt.position_id = pos.id
  join public.products p on p.id = opt.product_id and p.is_active = true
  join public.ops2_loose_sellable_stock_v1 s on s.product_id = p.id and s.is_active = true
  left join active_order_reservations orr on orr.product_id = p.id
  where greatest(0, coalesce(s.loose_sellable_stock, 0)
      - coalesce(orr.reserved, 0)) >= pos.quantity
), scored as (
  select e.*, floor(e.available_stock / nullif(e.quantity, 0))::bigint as coverage_baskets
  from eligible e
), ranked as (
  select s.*,
         row_number() over (partition by s.position_id order by
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
           'position_id', c.position_id, 'label', c.label, 'subtitle', c.subtitle, 'quantity', c.quantity,
           'product_id', c.product_id, 'name', c.product_name, 'sku', c.sku,
           'gtin', c.gtin, 'image_url', c.image_url, 'available_stock', c.available_stock,
           'coverage_baskets', c.coverage_baskets, 'option_rank', c.option_rank,
           'selection_score', c.selection_score,
           'selection_reason', case
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

