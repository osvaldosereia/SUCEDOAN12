-- Persist Flow-only mold-position labels for the Admin simulator.
-- This changes basket-admin Flow metadata only; public molds, prices and stock are unchanged.

create or replace function public.admin_basket_flow_configuration_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_uid uuid:=auth.uid();
begin
  if v_uid is null or not exists(
    select 1 from public.admin_users a
    where a.user_id=v_uid and a.is_active and a.role<>'viewer'
  ) then
    raise exception 'admin_not_authorized';
  end if;

  return jsonb_build_object(
    'basket_types',coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id',bt.id,
          'name',bt.name,
          'sort_order',bt.sort_order,
          'is_active',bt.is_active,
          'linked_template_id',bt.linked_basket_id,
          'template_active',b.is_active,
          'site_visible',coalesce(b.is_active,false),
          'public_composition_count',coalesce(m.public_composition_count,0),
          'flow_enabled',coalesce((bt.metadata #>> '{flow_v1,enabled}')::boolean,false),
          'flow_sort_order',case
            when coalesce(bt.metadata #>> '{flow_v1,sort_order}','') ~ '^[0-9]+$'
              then (bt.metadata #>> '{flow_v1,sort_order}')::integer
            else bt.sort_order
          end
        )
        order by
          case when coalesce(bt.metadata #>> '{flow_v1,sort_order}','') ~ '^[0-9]+$'
            then (bt.metadata #>> '{flow_v1,sort_order}')::integer else bt.sort_order end,
          bt.name
      )
      from public.basket_admin_basket_types bt
      left join public.basket_templates b on b.id=bt.linked_basket_id
      left join public.basket_molds m on m.basket_id=bt.linked_basket_id
    ),'[]'::jsonb),
    'product_types',coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id',pt.id,
          'name',pt.name,
          'category',pt.category,
          'sort_order',pt.sort_order,
          'is_active',pt.is_active,
          'legacy_labels',pt.legacy_labels,
          'position_labels',case
            when jsonb_typeof(pt.metadata #> '{flow_v1,position_labels}')='array'
              then pt.metadata #> '{flow_v1,position_labels}'
            else '[]'::jsonb
          end,
          'flow_enabled',coalesce((pt.metadata #>> '{flow_v1,enabled}')::boolean,pt.is_active),
          'flow_sort_order',case
            when coalesce(pt.metadata #>> '{flow_v1,sort_order}','') ~ '^[0-9]+$'
              then (pt.metadata #>> '{flow_v1,sort_order}')::integer
            else pt.sort_order
          end,
          'selection_mode',case
            when pt.metadata #>> '{flow_v1,selection_mode}' in ('single','multiple')
              then pt.metadata #>> '{flow_v1,selection_mode}'
            else 'multiple'
          end,
          'max_quantity',case
            when coalesce(pt.metadata #>> '{flow_v1,max_quantity}','') ~ '^[0-9]+$'
              then greatest(1,least(10,(pt.metadata #>> '{flow_v1,max_quantity}')::integer))
            else 10
          end,
          'options',coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'product_id',p.id,
                'name',p.name,
                'brand',p.brand,
                'sku',p.sku,
                'gtin',p.gtin,
                'image_url',p.image_url,
                'packaging',p.packaging,
                'price_cents',round((case when p.is_offer and p.offer_price is not null then p.offer_price else p.price end)*100)::integer,
                'regular_price_cents',case when p.is_offer and p.offer_price is not null then round(coalesce(p.price,0)*100)::integer else null end,
                'is_offer',p.is_offer and p.offer_price is not null,
                'is_active',p.is_active,
                'sort_order',o.sort_order
              )
              order by o.sort_order,p.id
            )
            from public.basket_admin_product_options o
            join public.products p on p.id=o.product_id
            where o.product_type_id=pt.id
          ),'[]'::jsonb)
        )
        order by
          case when coalesce(pt.metadata #>> '{flow_v1,sort_order}','') ~ '^[0-9]+$'
            then (pt.metadata #>> '{flow_v1,sort_order}')::integer else pt.sort_order end,
          pt.name
      )
      from public.basket_admin_product_types pt
    ),'[]'::jsonb),
    'quantities',coalesce((
      select jsonb_agg(jsonb_build_object(
        'basket_type_id',q.basket_type_id,
        'product_type_id',q.product_type_id,
        'quantity',q.quantity
      ))
      from public.basket_admin_quantities q
    ),'[]'::jsonb)
  );
end;
$function$;

create or replace function public.admin_basket_flow_configuration_save_v1(p_config jsonb)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_uid uuid:=auth.uid();
  v_row jsonb;
  v_id uuid;
  v_enabled boolean;
  v_order integer;
  v_mode text;
  v_max integer;
  v_position_labels jsonb;
begin
  if v_uid is null or not exists(
    select 1 from public.admin_users a
    where a.user_id=v_uid and a.is_active and a.role<>'viewer'
  ) then
    raise exception 'admin_not_authorized';
  end if;

  if p_config is null or jsonb_typeof(p_config)<>'object'
     or coalesce(jsonb_typeof(p_config->'basket_types'),'')<>'array'
     or coalesce(jsonb_typeof(p_config->'product_types'),'')<>'array' then
    raise exception 'basket_admin_flow_configuration_invalid';
  end if;

  if exists(
    select 1 from jsonb_array_elements(p_config->'basket_types') as x(value)
    group by x.value->>'id' having count(*)>1
  ) or exists(
    select 1 from jsonb_array_elements(p_config->'product_types') as x(value)
    group by x.value->>'id' having count(*)>1
  ) then
    raise exception 'basket_admin_flow_duplicate_id';
  end if;

  for v_row in select value from jsonb_array_elements(p_config->'basket_types') loop
    v_id:=nullif(v_row->>'id','')::uuid;
    v_enabled:=coalesce((v_row->>'flow_enabled')::boolean,false);
    v_order:=coalesce(nullif(v_row->>'flow_sort_order','')::integer,-1);
    if v_id is null or v_order<0 or v_order>1000 then
      raise exception 'basket_admin_flow_basket_invalid';
    end if;
    update public.basket_admin_basket_types bt
    set metadata=jsonb_set(
      coalesce(bt.metadata,'{}'::jsonb),
      '{flow_v1}',
      coalesce(bt.metadata->'flow_v1','{}'::jsonb)
        || jsonb_build_object('enabled',v_enabled,'sort_order',v_order),
      true
    ),
    updated_at=now()
    where bt.id=v_id;
    if not found then raise exception 'basket_admin_flow_basket_not_found'; end if;
  end loop;

  for v_row in select value from jsonb_array_elements(p_config->'product_types') loop
    v_id:=nullif(v_row->>'id','')::uuid;
    v_enabled:=coalesce((v_row->>'flow_enabled')::boolean,false);
    v_order:=coalesce(nullif(v_row->>'flow_sort_order','')::integer,-1);
    v_mode:=coalesce(v_row->>'selection_mode','');
    v_max:=coalesce(nullif(v_row->>'max_quantity','')::integer,0);
    v_position_labels:=coalesce(v_row->'position_labels','[]'::jsonb);
    if v_id is null or v_order<0 or v_order>1000
       or v_mode not in ('single','multiple') or v_max<1 or v_max>10
       or jsonb_typeof(v_position_labels)<>'array' then
      raise exception 'basket_admin_flow_product_type_invalid';
    end if;
    if jsonb_array_length(v_position_labels)>20 or exists(
      select 1 from jsonb_array_elements(v_position_labels) as x(value)
      where jsonb_typeof(x.value)<>'string'
         or nullif(btrim(x.value #>> '{}'),'') is null
         or char_length(btrim(x.value #>> '{}'))>120
    ) then
      raise exception 'basket_admin_flow_product_type_invalid';
    end if;
    update public.basket_admin_product_types pt
    set metadata=jsonb_set(
      coalesce(pt.metadata,'{}'::jsonb),
      '{flow_v1}',
      coalesce(pt.metadata->'flow_v1','{}'::jsonb)
        || jsonb_build_object(
          'enabled',v_enabled,
          'sort_order',v_order,
          'selection_mode',v_mode,
          'max_quantity',v_max,
          'position_labels',v_position_labels
        ),
      true
    ),
    updated_at=now()
    where pt.id=v_id;
    if not found then raise exception 'basket_admin_flow_product_type_not_found'; end if;
  end loop;

  return public.admin_basket_flow_configuration_v1();
end;
$function$;

revoke all on function public.admin_basket_flow_configuration_v1() from public,anon,authenticated;
revoke all on function public.admin_basket_flow_configuration_save_v1(jsonb) from public,anon,authenticated;
grant execute on function public.admin_basket_flow_configuration_v1() to authenticated;
grant execute on function public.admin_basket_flow_configuration_save_v1(jsonb) to authenticated;
